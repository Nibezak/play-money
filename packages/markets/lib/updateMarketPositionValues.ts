import Decimal from 'decimal.js'
import { TransactionClient } from '@slimefish/database'
import { quote } from '@slimefish/finance/amms/maniswap-v1.1'
import { getMarketBalances } from '@slimefish/finance/lib/getBalances'
import { BalanceChange, calculateRealizedGainsTax, findBalanceChange } from '@slimefish/finance/lib/helpers'
import { getMarketAmmAccount } from './getMarketAmmAccount'

type PositionValueClient = Pick<TransactionClient, 'marketOptionPosition'>

export async function updateMarketPositionValues({
  tx,
  balanceChanges,
  marketId,
}: {
  tx: PositionValueClient
  balanceChanges: Array<BalanceChange>
  marketId: string
}) {
  const ammAccount = await getMarketAmmAccount({ marketId })
  const ammBalances = await getMarketBalances({ accountId: ammAccount.id, marketId })

  const ammAssetBalances = ammBalances.filter(({ assetType }) => assetType === 'MARKET_OPTION')

  const marketOptionPositions = await tx.marketOptionPosition.findMany({ where: { marketId } }) ?? []
  const updatedMarketOptionBalances = ammAssetBalances.map((balance) => {
    const change =
      findBalanceChange({
        balanceChanges,
        accountId: balance.accountId,
        assetType: balance.assetType,
        assetId: balance.assetId,
      })?.change || 0

    return { ...balance, amount: balance.total.add(change) }
  })

  for (const position of marketOptionPositions) {
    const optionBalance = updatedMarketOptionBalances.find(b => b.assetId === position.optionId)
    if (!optionBalance) continue

    const newValue = await quote({
      amount: position.quantity,
      probability: new Decimal(0.01),
      targetShare: optionBalance.amount,
      shares: updatedMarketOptionBalances.map(balance => balance.amount),
    })

    if (position.value.toDecimalPlaces(4).equals(newValue.shares.toDecimalPlaces(4))) {
      continue
    }

    const tax = calculateRealizedGainsTax({ cost: position.cost, salePrice: newValue.shares })

    await tx.marketOptionPosition.update({
      where: { id: position.id },
      data: {
        value: Decimal.max(new Decimal(newValue.shares).sub(tax), 0),
        updatedAt: new Date(),
      },
    })
  }
}
