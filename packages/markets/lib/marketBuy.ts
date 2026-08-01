import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { calculateAmmTradeAmounts, getAmmTradeFeeBps } from '@slimefish/finance/lib/tradeFees'
import { getUniqueLiquidityProviderIds } from '@slimefish/markets/lib/getUniqueLiquidityProviderIds'
import { createNotification } from '@slimefish/notifications/lib/createNotification'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { isMarketTradable } from '../rules'
import { createLiquidityVolumeBonusTransaction } from './createLiquidityVolumeBonusTransaction'
import { createMarketBuyTransaction } from './createMarketBuyTransaction'
import { getMarket } from './getMarket'

export async function marketBuy({
  marketId,
  optionId,
  userId,
  amount,
  minShares,
  idempotencyKey,
}: {
  marketId: string
  optionId: string
  userId: string
  amount: Decimal
  minShares?: Decimal
  idempotencyKey?: string
}) {
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw new Error('Trade amount must be a positive value with at most two decimal places')
  }

  const [market, userAccount, feeBps] = await Promise.all([
    db.market.findUniqueOrThrow({
      where: { id: marketId },
      include: {
        options: { orderBy: { createdAt: 'asc' } },
        volumeBuckets: {
          where: { bucketStart: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        },
      },
    }),
    getUserPrimaryAccount({ userId }),
    getAmmTradeFeeBps(),
  ])
  const { feeAmount, netAmount } = calculateAmmTradeAmounts(amount, feeBps)

  if (!isMarketTradable({ market })) {
    throw new Error('Market is closed')
  }

  const transaction = await createMarketBuyTransaction({
    initiatorId: userId,
    accountId: userAccount.id,
    marketId,
    amount: netAmount,
    minShares,
    feeAmount,
    optionId,
    idempotencyKey,
    eventId: market.eventId,
    ammAccountId: market.ammAccountId,
    clearingAccountId: market.clearingAccountId,
  })

  const status = market.resolvedAt
    ? 'resolved' as const
    : market.canceledAt
      ? 'canceled' as const
      : market.closeDate && market.closeDate <= new Date()
        ? 'closed' as const
        : 'active' as const
  return {
    ...transaction,
    publicSnapshotSeed: {
      marketId: market.id,
      eventId: market.eventId ?? '',
      status,
      version: market.updatedAt.getTime(),
      volume: Number(market.volume || 0),
      volume24h: market.volumeBuckets.reduce((sum, bucket) => sum + Number(bucket.volume || 0), 0),
      liquidity: Number(market.liquidityCount || 0),
      options: market.options.map((option) => {
        const rawProbability = Number(option.probability)
        return {
          id: option.id,
          name: option.name,
          color: option.color,
          probability: Number.isFinite(rawProbability)
            ? Math.max(0, Math.min(1, rawProbability > 1 ? rawProbability / 100 : rawProbability))
            : 0,
        }
      }),
    },
  }
}

/** Secondary bookkeeping that must not extend the user's trade confirmation. */
export async function finalizeMarketBuy({
  marketId,
  optionId,
  userId,
  amount,
  transactionId,
}: {
  marketId: string
  optionId: string
  userId: string
  amount: Decimal
  transactionId: string
}) {
  const market = await getMarket({ id: marketId })

  const existingTradeInMarket = await db.transaction.findFirst({
    where: { id: { not: transactionId }, marketId, type: 'TRADE_BUY', initiatorId: userId },
  })

  if (!existingTradeInMarket) {
    await db.market.update({
      where: { id: marketId },
      data: { uniqueTradersCount: { increment: 1 }, updatedAt: new Date() },
    })
  }

  const [, recipientIds] = await Promise.all([
    createLiquidityVolumeBonusTransaction({ marketId: market.id, amountTraded: amount }),
    getUniqueLiquidityProviderIds(marketId, [userId]),
  ])

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        type: 'MARKET_TRADE',
        actorId: userId,
        marketId: market.id,
        marketOptionId: optionId,
        transactionId,
        groupKey: market.id,
        userId: recipientId,
        actionUrl: `/questions/${market.id}/${market.slug}/trades`,
      })
    )
  )

}
