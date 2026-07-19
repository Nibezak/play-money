import Decimal from 'decimal.js'
import db from '@play-money/database'
import { getUniqueLiquidityProviderIds } from '@play-money/markets/lib/getUniqueLiquidityProviderIds'
import { createNotification } from '@play-money/notifications/lib/createNotification'
import { getUserPrimaryAccount } from '@play-money/users/lib/getUserPrimaryAccount'
import { isMarketTradable } from '../rules'
import { createLiquidityVolumeBonusTransaction } from './createLiquidityVolumeBonusTransaction'
import { createMarketBuyTransaction } from './createMarketBuyTransaction'
import { getMarket } from './getMarket'

export async function marketBuy({
  marketId,
  optionId,
  userId,
  amount,
  idempotencyKey,
}: {
  marketId: string
  optionId: string
  userId: string
  amount: Decimal
  idempotencyKey?: string
}) {
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw new Error('Trade amount must be a positive value with at most two decimal places')
  }

  const [market, userAccount] = await Promise.all([getMarket({ id: marketId }), getUserPrimaryAccount({ userId })])

  if (!isMarketTradable({ market })) {
    throw new Error('Market is closed')
  }

  const transaction = await createMarketBuyTransaction({
    initiatorId: userId,
    accountId: userAccount.id,
    marketId,
    amount,
    optionId,
    idempotencyKey,
  })

  const existingTradeInMarket = await db.transaction.findFirst({
    where: { id: { not: transaction.id }, marketId, type: 'TRADE_BUY', initiatorId: userId },
  })

  if (transaction.replayed) return transaction

  if (!existingTradeInMarket) {
    await db.market.update({
      where: { id: marketId },
      data: { uniqueTradersCount: { increment: 1 }, updatedAt: new Date() },
    })
  }

  await createLiquidityVolumeBonusTransaction({ marketId: market.id, amountTraded: amount })

  const recipientIds = await getUniqueLiquidityProviderIds(marketId, [userId])

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        type: 'MARKET_TRADE',
        actorId: userId,
        marketId: market.id,
        marketOptionId: optionId,
        transactionId: transaction.id,
        groupKey: market.id,
        userId: recipientId,
        actionUrl: `/questions/${market.id}/${market.slug}/trades`,
      })
    )
  )

}
