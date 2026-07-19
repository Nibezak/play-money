import Decimal from 'decimal.js'
import { TransactionClient } from '@play-money/database'
import { TransactionTypeType } from '@play-money/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { BalanceChange, calculateBalanceSubtotals } from '@play-money/finance/lib/helpers'
import { updateBalance } from '@play-money/finance/lib/updateBalance'

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
