import db from '@play-money/database'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { getHouseAccount } from '@play-money/finance/lib/getHouseAccount'
import { calculateRealizedGainsTax } from '@play-money/finance/lib/helpers'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'
import { updateMarketBalances } from './updateMarketBalances'

export async function createMarketResolveWinTransactions({
  initiatorId,
  marketId,
  winningOptionId,
}: {
  initiatorId: string
  marketId: string
  winningOptionId: string
}) {
  const [ammAccount, clearingAccount, winningPositions, houseAccount] = await Promise.all([
    getMarketAmmAccount({ marketId }),
    getMarketClearingAccount({ marketId }),
    db.marketOptionPosition.findMany({
      where: {
        marketId,
        optionId: winningOptionId,
      },
      include: {
        account: {
          select: { userId: true },
        },
      },
    }),
    getHouseAccount(),
  ])

  const transactions = []

  // Transfer winning shares back to the AMM and convert to primary currency
  for (const position of winningPositions) {
    if (position.quantity.lte(0)) continue
    const tax = calculateRealizedGainsTax({ cost: position.cost, salePrice: position.quantity })

    const entries = [
      {
        fromAccountId: position.accountId,
        toAccountId: ammAccount.id,
        assetType: 'MARKET_OPTION',
        assetId: winningOptionId,
        amount: position.quantity,
      } as const,
      {
        fromAccountId: clearingAccount.id,
        toAccountId: position.accountId,
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        amount: tax.gt(0) ? position.quantity.sub(tax) : position.quantity,
      } as const,
    ]

    if (tax.gt(0)) {
      entries.push({
        amount: tax,
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        fromAccountId: clearingAccount.id,
        toAccountId: houseAccount.id,
      })
    }

    const payout = tax.gt(0) ? position.quantity.sub(tax) : position.quantity
    const transaction = await executeTransaction({
        type: 'TRADE_WIN',
        initiatorId: position.account?.userId ?? initiatorId,
        entries,
        marketId,
        optionIds: [winningOptionId],
        additionalLogic: async (txParams) => {
          await txParams.tx.marketOptionPosition.update({
              where: {
                id: position.id,
              },
              data: {
                quantity: {
                    decrement: position.quantity.toString(),
                },
                value: 0,
                updatedAt: new Date(),
              },
            })
          return updateMarketBalances({ ...txParams, marketId })
        },
      })

    transactions.push({
      transaction,
      userId: position.account?.userId,
      payout: payout.toDecimalPlaces(2).toString(),
      shares: position.quantity.toString(),
      optionId: winningOptionId,
    })
  }

  return transactions
}
