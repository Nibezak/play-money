import Decimal from 'decimal.js'
import { TransactionClient } from '@slimefish/database'
import { TransactionTypeType } from '@slimefish/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { BalanceChange, calculateBalanceSubtotals } from '@slimefish/finance/lib/helpers'
import { updateBalance, updateBalancesWithoutSubtotals } from '@slimefish/finance/lib/updateBalance'

export async function updateMarketBalances({
  tx,
  transactionType,
  balanceChanges,
  marketId,
  updateSubtotals = true,
}: {
  tx: TransactionClient
  transactionType: TransactionTypeType
  balanceChanges: Array<BalanceChange>
  marketId: string
  updateSubtotals?: boolean
}) {
  if (!updateSubtotals) {
    await updateBalancesWithoutSubtotals({
      tx,
      changes: balanceChanges
        .filter(({ assetType }) => assetType === 'MARKET_OPTION')
        .map(({ accountId, assetType, assetId, change }) => ({
          accountId,
          assetType,
          assetId,
          change: new Decimal(change),
          marketId,
        })),
    })
    return []
  }

  const balances = []
  for (const { accountId, assetType, assetId, change } of balanceChanges) {
    if (assetType !== 'MARKET_OPTION') continue

    const subtotals = updateSubtotals
      ? await calculateBalanceSubtotals({
          tx,
          accountId,
          assetType,
          assetId,
          change: new Decimal(change),
          transactionType,
          marketId,
        })
      : undefined

    balances.push(await updateBalance({
      tx,
      accountId,
      assetType,
      assetId,
      subtotals,
      change: new Decimal(change),
      marketId,
    }))
  }
  return balances
}
