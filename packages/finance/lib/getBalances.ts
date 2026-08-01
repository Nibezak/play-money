import Decimal from 'decimal.js'
import db, { Balance, MarketOptionPosition } from '@slimefish/database'
import { AssetTypeType } from '@slimefish/database/zod/inputTypeSchemas/AssetTypeSchema'

export type NetBalance = Omit<Balance, 'subtotals'> & { subtotals: Record<string, number> }
export type NetBalanceAsNumbers = Omit<Balance, 'total' | 'subtotals'> & {
  total: number
  subtotals: Record<string, number>
}

export type MarketOptionPositionAsNumbers = Omit<MarketOptionPosition, 'value' | 'cost' | 'quantity'> & {
  value: number
  cost: number
  quantity: number
}

export async function getBalance({
  accountId,
  assetType,
  assetId,
  marketId,
}: {
  accountId: string
  assetType: AssetTypeType
  assetId: string
  marketId?: string
}): Promise<NetBalance> {
  const balance = await db.balance.findFirst({
    where: {
      accountId,
      assetType,
      assetId,
      marketId: marketId ?? null,
    },
  })

  if (!balance) {
    throw new Error('No balance')
  }

  return balance as unknown as NetBalance
}

export async function getMarketBalances({
  accountId,
  marketId,
}: {
  accountId: string
  marketId: string
}): Promise<Array<NetBalance>> {
  const balances = await db.balance.findMany({
    where: {
      accountId,
      marketId,
      OR: [
        { assetType: 'MARKET_OPTION' },
        { assetType: 'CURRENCY', assetId: 'PRIMARY' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  return balances as unknown as Array<NetBalance>
}

export async function getListBalances({
  accountId,
  listId,
}: {
  accountId: string
  listId: string
}): Promise<Array<NetBalance>> {
  const list = await db.list.findUnique({
    where: { id: listId },
    include: {
      markets: {
        include: {
          market: {
            include: {
              options: true,
            },
          },
        },
      },
    },
  })

  const balances = await Promise.all(
    (list?.markets ?? []).map((market) => {
      return Promise.all([
        getBalance({ accountId, assetType: 'CURRENCY', assetId: 'PRIMARY', marketId: market.market.id }),
        ...market.market.options.map((option) => {
          return getBalance({ accountId, assetType: 'MARKET_OPTION', assetId: option.id, marketId: market.market.id })
        }),
      ])
    })
  )

  return balances.flat().filter((x) => x !== null)
}

export function transformMarketBalancesToNumbers(balances: Array<NetBalance> = []): Array<NetBalanceAsNumbers> {
  return balances.map((balance) => ({
    ...balance,
    total: balance.total.toNumber(),
  }))
}

export function transformMarketOptionPositionToNumbers(
  positions: Array<MarketOptionPosition> = []
): Array<MarketOptionPositionAsNumbers> {
  return positions.map((balance) => ({
    ...balance,
    value: balance.value.toNumber(),
    cost: balance.cost.toNumber(),
    quantity: balance.quantity.toNumber(),
  }))
}
