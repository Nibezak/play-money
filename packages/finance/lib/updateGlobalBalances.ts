import Decimal from 'decimal.js'
import { TransactionClient } from '@slimefish/database'
import { TransactionTypeType } from '@slimefish/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { BalanceChange, calculateBalanceSubtotals } from './helpers'
import { updateBalance, updateBalancesWithoutSubtotals } from './updateBalance'

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
  if (!updateSubtotals) {
    await updateBalancesWithoutSubtotals({
      tx,
      changes: balanceChanges
        .filter(({ assetType }) => assetType === 'CURRENCY')
        .map(({ accountId, assetType, assetId, change }) => ({
          accountId,
          assetType,
          assetId,
          change: new Decimal(change),
        })),
    })
    return
  }

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
