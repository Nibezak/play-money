import Decimal from 'decimal.js'
import { TransactionClient } from '@slimefish/database'
import { BalanceChange, findBalanceChange } from '@slimefish/finance/lib/helpers'

export async function updateMarketPosition({
  tx,
  marketId,
  accountId,
  optionId,
  balanceChanges,
}: {
  tx: TransactionClient
  marketId: string
  accountId: string
  optionId: string
  balanceChanges: Array<BalanceChange>
}) {
  const costChange = findBalanceChange({
    balanceChanges,
    accountId,
    assetType: 'CURRENCY',
    assetId: 'PRIMARY',
  })
  const cost = new Decimal(costChange?.change || 0)
  const quantityChange = findBalanceChange({
    balanceChanges,
    accountId,
    assetType: 'MARKET_OPTION',
    assetId: optionId,
  })
  const quantity = new Decimal(quantityChange?.change || 0)

  return tx.marketOptionPosition.upsert({
    where: {
      accountId_optionId: {
        accountId,
        optionId: optionId,
      },
    },
    update: {
      quantity: quantity.isNegative() ? { decrement: quantity.abs().toString() } : { increment: quantity.toString() },
      // cost in inverse since buying is negative
      cost: cost.isNegative() ? { increment: cost.abs().toString() } : { decrement: cost.toString() },
    },
    create: {
      accountId,
      marketId,
      optionId: optionId,
      quantity,
      // cost in inverse since buying is negative
      cost: cost.isZero() ? new Decimal(0) : cost.isNegative() ? cost.abs() : cost.neg(),
      value: cost.isZero() ? new Decimal(0) : cost.isNegative() ? cost.abs() : cost.neg(),
    },
  })
}
