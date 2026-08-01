import Decimal from 'decimal.js'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { executeTrade } from './executeTrade'
import { updateEventMarketProbabilities } from './updateEventMarketProbabilities'
import { updateMarketPosition } from './updateMarketPosition'

export async function createMarketBuyTransaction({
  initiatorId,
  accountId,
  amount,
  minShares,
  marketId,
  optionId,
  idempotencyKey,
  feeAmount,
  eventId,
  ammAccountId,
  clearingAccountId,
}: {
  initiatorId: string
  accountId: string
  amount: Decimal
  minShares?: Decimal
  marketId: string
  optionId: string
  idempotencyKey?: string
  feeAmount?: Decimal
  eventId?: string | null
  ammAccountId?: string
  clearingAccountId?: string
}) {
  const entries = await executeTrade({
    accountId,
    amount,
    minShares,
    marketId,
    optionId,
    isBuy: true,
    feeAmount,
    ammAccountId,
    clearingAccountId,
  })
  let confirmedPosition: { cost: Decimal; quantity: Decimal; value: Decimal } | null = null
  const transaction = await executeTransaction({
    type: 'TRADE_BUY',
    initiatorId,
    entries,
    marketId,
    optionIds: [optionId],
    deferBalanceSubtotals: true,
    additionalLogic: async (txParams) => {
      const eventScopeId = eventId || marketId
      await txParams.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'market-status:' + eventScopeId}))`
      const currentMarketState = await txParams.tx.market.findUniqueOrThrow({
        where: { id: marketId },
        select: { closeDate: true, resolvedAt: true, canceledAt: true },
      })
      if (
        currentMarketState.resolvedAt ||
        currentMarketState.canceledAt ||
        (currentMarketState.closeDate && currentMarketState.closeDate <= new Date())
      ) {
        throw new Error('Market is closed')
      }
      const entryLockKey = `event-entry:${initiatorId}:${eventScopeId}`
      await txParams.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entryLockKey}))`

      const existingEntry = await txParams.tx.transaction.findFirst({
        where: {
          id: { not: txParams.transactionId },
          initiatorId,
          market: eventId ? { eventId } : { id: marketId },
          type: 'TRADE_BUY',
        },
        select: { id: true },
      })
      const user = await txParams.tx.user.findUnique({
        where: { id: initiatorId },
        select: { settings: true },
      })

      const settings =
        user?.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
          ? (user.settings as Record<string, unknown>)
          : {}
      if (settings.tradingBlocked === true || settings.is_blocked === true) {
        throw new Error('Trading is suspended for this account')
      }

      const tradedAmount = amount.add(feeAmount ?? 0).toDecimalPlaces(2)
      const bucketStart = new Date()
      bucketStart.setUTCMinutes(0, 0, 0)
      await Promise.all([
        txParams.tx.market.update({
          where: { id: marketId },
          data: { volume: { increment: tradedAmount.toString() }, updatedAt: new Date() },
        }),
        txParams.tx.marketVolumeBucket.upsert({
          where: { marketId_bucketStart: { marketId, bucketStart } },
          update: { volume: { increment: tradedAmount.toString() }, updatedAt: new Date() },
          create: { marketId, bucketStart, volume: tradedAmount.toString() },
        }),
      ])

      // Create or update the position before we value it
      confirmedPosition = await updateMarketPosition({ ...txParams, marketId, accountId, optionId })

    },
    idempotencyKey,
  })
  // A completed trade must not return stale prices. The event-wide probability
  // set powers the next quote, charts, cards, and trade panel.
  await updateEventMarketProbabilities(marketId)
  const committedPosition = confirmedPosition as {
    cost: Decimal
    quantity: Decimal
    value: Decimal
  } | null

  return {
    ...transaction,
    receipt: {
      balance: entries.balanceAfter.toNumber(),
      position: committedPosition
        ? {
            optionId,
            cost: Number(committedPosition.cost),
            quantity: Number(committedPosition.quantity),
            value: Number(committedPosition.value),
          }
        : {
            optionId,
            cost: amount.toNumber(),
            quantity: entries.receivedShares.toNumber(),
            value: amount.toNumber(),
      },
    },
  }
}
