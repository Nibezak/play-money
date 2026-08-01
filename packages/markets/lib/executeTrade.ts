import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { trade } from '@slimefish/finance/amms/maniswap-v1.1'
import { getBalance, getMarketBalances } from '@slimefish/finance/lib/getBalances'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { TransactionEntryInput } from '@slimefish/finance/types'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'

export async function executeTrade({
  accountId,
  amount,
  minShares,
  marketId,
  optionId,
  isBuy,
  feeAmount = new Decimal(0),
  ammAccountId,
  clearingAccountId,
}: {
  accountId: string
  amount: Decimal
  minShares?: Decimal
  marketId: string
  optionId: string
  isBuy: boolean
  feeAmount?: Decimal
  ammAccountId?: string
  clearingAccountId?: string
}): Promise<Array<TransactionEntryInput> & {
  balanceAfter: Decimal
  receivedShares: Decimal
}> {
  if (!isBuy) {
    throw new Error('Selling is disabled for AMM markets')
  }
  const [ammAccount, clearingAccount] = await Promise.all([
    ammAccountId ? { id: ammAccountId } : getMarketAmmAccount({ marketId }),
    clearingAccountId ? { id: clearingAccountId } : getMarketClearingAccount({ marketId }),
  ])

  const [balanceToTrade, ammBalances, marketOption] = await Promise.all([
    getBalance({ accountId, assetType: 'CURRENCY', assetId: 'PRIMARY' }),
    getMarketBalances({ accountId: ammAccount.id, marketId }),
    db.marketOption.findUnique({
      where: { id: optionId },
      select: { marketId: true, probability: true },
    }),
  ])

  const requiredBalance = amount.add(feeAmount)
  if (!balanceToTrade.total.gte(requiredBalance)) {
    throw new Error('User does not have enough balance to purchase')
  }
  const ammAssetBalances = ammBalances.filter(({ assetType }) => assetType === 'MARKET_OPTION')

  const marketOptionBalance = ammAssetBalances.find((balance) => balance.assetId === optionId)
  if (!marketOptionBalance || !marketOption || marketOption.marketId !== marketId) {
    throw new Error('Cannot find option to trade')
  }
  const targetIndex = ammAssetBalances.findIndex((balance) => balance.assetId === optionId)

  const entries: Array<TransactionEntryInput> = [
        {
          amount,
          assetType: 'CURRENCY',
          assetId: 'PRIMARY',
          fromAccountId: accountId,
          toAccountId: clearingAccount.id,
        },
        ...ammAssetBalances.map((balance) => {
          return {
            amount,
            assetType: 'MARKET_OPTION',
            assetId: balance.assetId,
            fromAccountId: clearingAccount.id,
            toAccountId: ammAccount.id,
          } as const
        }),
      ]

  if (feeAmount.gt(0)) {
    const houseAccount = await getHouseAccount()
    entries.push({
      amount: feeAmount,
      assetType: 'CURRENCY',
      assetId: 'PRIMARY',
      fromAccountId: accountId,
      toAccountId: houseAccount.id,
    })
  }

  // Keep the AMM inventory curve in sync, but price user shares from the
  // canonical option probability used everywhere in the product UI.
  await trade({
    isBuy: true,
    amount,
    targetShare: marketOptionBalance.total,
    shares: ammAssetBalances.map((balance) => balance.total),
    targetIndex,
  })
  // A market can temporarily round to 0 or 100 at storage/display precision.
  // Never issue zero-cost shares or a zero payout; execution uses the same
  // bounded probability as the quote endpoint.
  const storedProbability = new Decimal((marketOption.probability ?? 0.5).toString())
  const normalizedProbability = storedProbability.gt(1)
    ? storedProbability.div(100)
    : storedProbability
  const optionProbability = Decimal.min(
    0.999,
    Decimal.max(0.001, normalizedProbability),
  )
  const receivedShares = amount.div(optionProbability)
  if (marketOptionBalance.total.lt(receivedShares)) {
    throw new Error('Not enough market liquidity to fill this trade')
  }
  entries.push({
    amount: receivedShares,
    assetType: 'MARKET_OPTION',
    assetId: optionId,
    fromAccountId: ammAccount.id,
    toAccountId: accountId,
  })

  if (minShares && receivedShares.lt(minShares)) {
    throw new Error('Price moved beyond the allowed slippage tolerance')
  }

  return Object.assign(entries, {
    balanceAfter: balanceToTrade.total.minus(requiredBalance).toDecimalPlaces(2),
    receivedShares,
  })
}
