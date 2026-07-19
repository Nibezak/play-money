import db from '@play-money/database'
import { getUniqueTraderIds } from '@play-money/markets/lib/getUniqueTraderIds'
import { createNotification } from '@play-money/notifications/lib/createNotification'
import { getUserById } from '@play-money/users/lib/getUserById'
import { isMarketCanceled, isMarketResolved } from '../rules'
import { createMarketExcessLiquidityTransactions } from './createMarketExcessLiquidityTransactions'
import { createMarketResolveLossTransactions } from './createMarketResolveLossTransactions'
import { createMarketResolveWinTransactions } from './createMarketResolveWinTransactions'
import { getMarket } from './getMarket'

export async function resolveMarket({
  resolverId,
  marketId,
  optionId,
  supportingLink,
}: {
  resolverId: string
  marketId: string
  optionId: string
  supportingLink?: string
}) {
  const market = await getMarket({ id: marketId, extended: true })
  const resolvingUser = await getUserById({ id: resolverId })

  if (isMarketResolved({ market }) && market.marketResolution?.resolutionId !== optionId) {
    throw new Error('Market already resolved with a different outcome')
  }

  if (isMarketCanceled({ market })) {
    throw new Error('Market is canceled')
  }

  await db.$transaction(
    async (tx) => {
      const now = new Date()

      await tx.marketResolution.upsert({
        where: { marketId },
        create: {
          marketId,
          resolutionId: optionId,
          supportingLink,
          resolvedById: resolverId,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          resolutionId: optionId,
          supportingLink,
          resolvedById: resolverId,
          updatedAt: now,
        },
      })

      await tx.market.update({
        where: { id: marketId },
        data: { closeDate: now, updatedAt: now },
      })
    },
    {
      maxWait: 15000,
      timeout: 120000,
    }
  )

  await createMarketResolveLossTransactions({
    marketId,
    initiatorId: resolverId,
    winningOptionId: optionId,
  })

  const winSettlements = await createMarketResolveWinTransactions({
    marketId,
    initiatorId: resolverId,
    winningOptionId: optionId,
  })

  await createMarketExcessLiquidityTransactions({ marketId, initiatorId: resolverId })

  await db.market.update({
    where: { id: marketId },
    data: { resolvedAt: new Date(), updatedAt: new Date() },
  })

  if (market.eventId) {
    const unresolvedMarketCount = await db.market.count({
      where: { eventId: market.eventId, resolvedAt: null, canceledAt: null },
    })
    if (unresolvedMarketCount === 0) {
      await db.event.update({
        where: { id: market.eventId },
        data: { status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() },
      })
    }
  }

  const recipientIds = await getUniqueTraderIds(marketId, [resolvingUser.id])
  const payoutByUserId = new Map<string, number>()
  for (const settlement of winSettlements) {
    if (!settlement.userId) continue
    payoutByUserId.set(
      settlement.userId,
      (payoutByUserId.get(settlement.userId) ?? 0) + Number(settlement.payout),
    )
  }

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        type: 'MARKET_RESOLVED',
        actorId: resolverId,
        marketId: market.id,
        marketOptionId: optionId,
        groupKey: market.id,
        userId: recipientId,
        actionUrl: `/questions/${market.id}/${market.slug}`,
      })
    )
  )

  const settlementRecipientIds = Array.from(new Set([
    ...recipientIds,
    ...Array.from(payoutByUserId.keys()),
  ]))

  return {
    success: true,
    recipients: settlementRecipientIds.map((userId) => ({
      userId,
      payout: Number((payoutByUserId.get(userId) ?? 0).toFixed(2)),
      won: payoutByUserId.has(userId),
    })),
  }
}
