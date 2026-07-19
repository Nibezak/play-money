import Decimal from 'decimal.js'
import db, { TransactionClient } from '@play-money/database'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { executeTrade } from './executeTrade'
import { updateMarketBalances } from './updateMarketBalances'
import { updateMarketOptionProbabilities } from './updateMarketOptionProbabilities'
import { updateMarketPosition } from './updateMarketPosition'
import { updateMarketPositionValues } from './updateMarketPositionValues'

export async function createMarketBuyTransaction({
  initiatorId,
  accountId,
  amount,
  marketId,
  optionId,
  idempotencyKey,
}: {
  initiatorId: string
  accountId: string
  amount: Decimal
  marketId: string
  optionId: string
  idempotencyKey?: string
}) {
  const entries = await executeTrade({
    accountId,
    amount,
    marketId,
    optionId,
    isBuy: true,
  })

  const transaction = await executeTransaction({
    type: 'TRADE_BUY',
    initiatorId,
    entries,
    marketId,
    optionIds: [optionId],
    deferBalanceSubtotals: true,
    additionalLogic: async (txParams) => {
      const lockedMarket = await txParams.tx.market.findUniqueOrThrow({
        where: { id: marketId },
        select: { eventId: true },
      })
      const eventScopeId = lockedMarket.eventId || marketId
      const entryLockKey = `event-entry:${initiatorId}:${eventScopeId}`
      await txParams.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entryLockKey}))`

      const existingEntry = await txParams.tx.transaction.findFirst({
          where: {
            id: { not: txParams.transactionId },
            initiatorId,
            market: lockedMarket.eventId ? { eventId: lockedMarket.eventId } : { id: marketId },
            type: 'TRADE_BUY',
          },
          select: { id: true },
        })
      const user = await txParams.tx.user.findUnique({
          where: { id: initiatorId },
          select: { settings: true },
        })

      const settings = user?.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
        ? user.settings as Record<string, unknown>
        : {}
      if (settings.tradingBlocked === true || settings.is_blocked === true) {
        throw new Error('Trading is suspended for this account')
      }
      if (existingEntry) {
        throw new Error('You already entered this event. Each account may take one position per event.')
      }

      // Create or update the position before we value it
      await updateMarketPosition({ ...txParams, marketId, accountId, optionId })

      await updateMarketBalances({ ...txParams, marketId, updateSubtotals: false })
    },
    idempotencyKey,
  })

  // Mark-to-market values are derived data. Refresh them after commit so a
  // large holder set cannot roll back an otherwise valid, fully funded trade.
  void Promise.all([
    db.market.update({
      where: { id: marketId },
      data: { liquidityCount: { increment: amount.toNumber() }, updatedAt: new Date() },
    }),
    updateMarketPositionValues({ tx: db as unknown as TransactionClient, balanceChanges: [], marketId }),
  ]).then(async () => {
    const market = await db.market.findUniqueOrThrow({ where: { id: marketId }, select: { ammAccountId: true } })
    const { getMarketBalances } = await import('@play-money/finance/lib/getBalances')
    const balances = await getMarketBalances({ accountId: market.ammAccountId, marketId })
    await updateMarketOptionProbabilities({
      tx: db as unknown as TransactionClient,
      balances,
      marketId,
    })
  }).catch((error) => {
    console.error('Failed to refresh derived market data after trade', error)
  })

  return transaction
}
