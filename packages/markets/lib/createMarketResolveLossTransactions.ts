import Decimal from 'decimal.js'
import db from '@play-money/database'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { updateMarketBalances } from './updateMarketBalances'

export async function createMarketResolveLossTransactions({
  marketId,
  initiatorId,
  winningOptionId,
}: {
  marketId: string
  initiatorId: string
  winningOptionId: string
}) {
  const [ammAccount, losingPositions] = await Promise.all([
    getMarketAmmAccount({ marketId }),
    db.marketOptionPosition.findMany({
      where: {
        marketId,
        option: {
          id: {
            not: winningOptionId,
          },
        },
      },
    }),
  ])

  const summedLosingQuantities = losingPositions.reduce(
    (acc, position) => {
      if (!acc[position.accountId]) {
        acc[position.accountId] = {}
      }

      if (!acc[position.accountId][position.optionId]) {
        acc[position.accountId][position.optionId] = new Decimal(0)
      }

      acc[position.accountId][position.optionId] = acc[position.accountId][position.optionId].add(position.quantity)

      return acc
    },
    {} as Record<string, Record<string, Decimal>>
  )

  const entries = Object.entries(summedLosingQuantities).flatMap(([accountId, optionQuantity]) =>
    Object.entries(optionQuantity)
      .filter(([_, quantity]) => quantity.toDecimalPlaces(0).gt(0))
      .map(([optionId, quantity]) => ({
        fromAccountId: accountId,
        toAccountId: ammAccount.id,
        assetType: 'MARKET_OPTION' as const,
        assetId: optionId,
        amount: quantity,
      }))
  )

  // Short circuit if no entries
  if (entries.length === 0) {
    return []
  }

  await executeTransaction({
    type: 'TRADE_LOSS',
    entries,
    marketId,
    optionIds: Array.from(new Set(entries.map(entry => entry.assetId))),
    additionalLogic: async (txParams) => {
      for (const [accountId, optionQuantity] of Object.entries(summedLosingQuantities)) {
        for (const [optionId, quantity] of Object.entries(optionQuantity)) {
          if (quantity.lte(0)) continue
          await txParams.tx.marketOptionPosition.update({
              where: {
                accountId_optionId: {
                  accountId,
                  optionId,
                },
              },
              data: {
                quantity: {
                  decrement: quantity.toString(),
                },
                value: 0,
                updatedAt: new Date(),
              },
            })
        }
      }
      return updateMarketBalances({ ...txParams, marketId })
    },
  })

  return entries
}
