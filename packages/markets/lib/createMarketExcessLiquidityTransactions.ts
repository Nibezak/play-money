import Decimal from 'decimal.js'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getBalance, getMarketBalances } from '@slimefish/finance/lib/getBalances'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'
import { getMarketLiquidity } from './getMarketLiquidity'
import { updateMarketBalances } from './updateMarketBalances'

export async function createMarketExcessLiquidityTransactions({
  initiatorId,
  marketId,
}: {
  initiatorId: string
  marketId: string
}) {
  const [ammAccount, clearingAccount] = await Promise.all([
    getMarketAmmAccount({ marketId }),
    getMarketClearingAccount({ marketId }),
  ])

  const [balances, clearingCurrencyBalance] = await Promise.all([
    getMarketBalances({ accountId: ammAccount.id, marketId }),
    getBalance({ accountId: clearingAccount.id, assetType: 'CURRENCY', assetId: 'PRIMARY' }),
  ])
  const ammOptionBalances = balances.filter(({ assetType }) => assetType === 'MARKET_OPTION')
  const amountToDistribute = Decimal.max(
    Decimal.min(clearingCurrencyBalance.total, ...ammOptionBalances.map((b) => b.total)),
    0,
  )
  let amountDistributed = new Decimal(0)

  const liquidity = await getMarketLiquidity(marketId)
  const transactions = []

  for (const [accountId, providedAmount] of Object.entries(liquidity.providers)) {
    if (providedAmount.isZero()) continue

    const proportion = providedAmount.div(liquidity.total)
    const remainingDistributable = Decimal.max(amountToDistribute.sub(amountDistributed), 0)
    const payout = Decimal.min(
      amountToDistribute.mul(proportion).toDecimalPlaces(2),
      providedAmount.toDecimalPlaces(2),
      remainingDistributable,
    )

    if (payout.isZero()) continue

    const entries = [
      ...ammOptionBalances.map((balance) => {
        return {
          amount: payout,
          assetType: 'MARKET_OPTION',
          assetId: balance.assetId,
          fromAccountId: ammAccount.id,
          toAccountId: clearingAccount.id,
        } as const
      }),
      {
        amount: payout,
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        fromAccountId: clearingAccount.id,
        toAccountId: accountId,
      } as const,
    ]

    transactions.push(await executeTransaction({
        type: 'LIQUIDITY_RETURNED',
        entries,
        marketId,
        additionalLogic: async (txParams) => updateMarketBalances({ ...txParams, marketId }),
      }))

    amountDistributed = amountDistributed.plus(payout)
  }

  const amountToReturnToHouse = Decimal.max(amountToDistribute.sub(amountDistributed), 0).toDecimalPlaces(2)

  if (!amountToReturnToHouse.isZero()) {
    const houseAccount = await getHouseAccount()

    const entries = [
      ...ammOptionBalances.map((balance) => {
        return {
          amount: amountToReturnToHouse,
          assetType: 'MARKET_OPTION',
          assetId: balance.assetId,
          fromAccountId: ammAccount.id,
          toAccountId: clearingAccount.id,
        } as const
      }),
      {
        amount: amountToReturnToHouse,
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        fromAccountId: clearingAccount.id,
        toAccountId: houseAccount.id,
      } as const,
    ]

    transactions.push(await executeTransaction({
        type: 'LIQUIDITY_RETURNED',
        entries,
        marketId,
        additionalLogic: async (txParams) => updateMarketBalances({ ...txParams, marketId }),
      }))
  }

  return transactions
}
