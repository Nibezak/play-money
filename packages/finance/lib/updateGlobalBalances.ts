import Decimal from 'decimal.js'
import { TransactionClient } from '@play-money/database'
import { TransactionTypeType } from '@play-money/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { BalanceChange, calculateBalanceSubtotals } from './helpers'
import { updateBalance } from './updateBalance'

export async function updateGlobalBalances({
  tx,
  transactionType,
  balanceChanges,
  updateSubtotals = true,
}: {
  tx: TransactionClient
  transactionType: TransactionTypeType
  balanceChanges: Array<BalanceChange>
  updateSubtotals?: boolean
}) {
  for (const { accountId, assetType, assetId, change } of balanceChanges) {
    if (assetType !== 'CURRENCY') {
      continue
    }

    const subtotals = updateSubtotals
      ? await calculateBalanceSubtotals({
          tx,
          accountId,
          assetType,
          assetId,
          change: new Decimal(change),
          transactionType,
        })
      : undefined

    await updateBalance({
      tx,
      accountId,
      assetType,
      assetId,
      subtotals,
      change: new Decimal(change),
    })
  }
}
