import db, { TransactionClient } from '@slimefish/database'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { TransactionTypeType } from '@slimefish/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { BalanceChange, calculateBalanceChanges } from '@slimefish/finance/lib/helpers'
import { TransactionEntryInput } from '../types'
import { updateGlobalBalances } from './updateGlobalBalances'
import { updateBalancesWithoutSubtotals } from './updateBalance'

const TRANSACTION_MAX_WAIT_MS = 15000
const TRANSACTION_TIMEOUT_MS = 120000

export async function executeTransaction({
  type,
  initiatorId,
  entries,
  marketId,
  optionIds,
  deferBalanceSubtotals = false,
  additionalLogic,
  idempotencyKey,
}: {
  type: TransactionTypeType
  initiatorId?: string
  entries: Array<TransactionEntryInput>
  marketId?: string
  optionIds?: Array<string>
  deferBalanceSubtotals?: boolean
  additionalLogic?: (params: {
    tx: TransactionClient
    balanceChanges: Array<BalanceChange>
    transactionType: TransactionTypeType
    transactionId: string
  }) => Promise<unknown>
  idempotencyKey?: string
}) {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    amount: entry.assetType === 'CURRENCY'
      ? new Decimal(entry.amount).toDecimalPlaces(2)
      : entry.amount,
  })) as Array<TransactionEntryInput>
  if (normalizedEntries.length === 0) throw new Error('A ledger transaction must contain at least one entry')
  for (const entry of normalizedEntries) {
    const amount = new Decimal(entry.amount)
    if (!amount.isFinite() || amount.lte(0)) throw new Error('Ledger entry amount must be positive and finite')
    if (entry.fromAccountId === entry.toAccountId) throw new Error('Ledger entry accounts must be different')
  }
  const balanceChanges = calculateBalanceChanges({ entries: normalizedEntries })

  try {
    return await db.$transaction(
      async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type,
          externalId: idempotencyKey,
          initiatorId,
          marketId: marketId ?? null,
          entries: { create: normalizedEntries },
          options: {
            connect: optionIds?.map((id) => ({ id })),
          },
        },
      })

      if (deferBalanceSubtotals) {
        await updateBalancesWithoutSubtotals({
          tx,
          allowNegativeMarketOptionBalances: true,
          changes: balanceChanges.map(({ accountId, assetType, assetId, change }) => ({
            accountId,
            assetType,
            assetId,
            change: new Decimal(change),
            marketId: assetType === 'MARKET_OPTION' ? marketId : undefined,
          })),
        })
      } else {
        await updateGlobalBalances({
          tx,
          transactionType: type,
          balanceChanges,
        })
      }
      await additionalLogic?.({ tx, balanceChanges, transactionType: type, transactionId: transaction.id })

      return { ...transaction, replayed: false as const }
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      }
    )
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db.transaction.findUnique({ where: { externalId: idempotencyKey } })
      if (existing) return { ...existing, replayed: true as const }
    }
    throw error
  }
}
