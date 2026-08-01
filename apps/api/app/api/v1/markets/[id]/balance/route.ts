import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import db from '@slimefish/database'
import {
  getMarketBalances,
  transformMarketBalancesToNumbers,
  transformMarketOptionPositionToNumbers,
} from '@slimefish/finance/lib/getBalances'
import { getMarketAmmAccount } from '@slimefish/markets/lib/getMarketAmmAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const { id } = schema.get.parameters.parse(params)
    const userId = await getAuthUser(req)
    const ammAccount = await getMarketAmmAccount({ marketId: id })
    const userAccount = userId ? await getUserPrimaryAccount({ userId }) : undefined

    const [ammBalances, userBalancesInMarket, userPositions] = await Promise.all([
      getMarketBalances({ accountId: ammAccount.id, marketId: id }),
      userAccount ? getMarketBalances({ accountId: userAccount.id, marketId: id }) : undefined,
      userAccount
        ? db.marketOptionPosition.findMany({ where: { marketId: id, accountId: userAccount.id } })
        : undefined,
    ])

    return NextResponse.json({
      data: {
        amm: transformMarketBalancesToNumbers(ammBalances),
        user: transformMarketBalancesToNumbers(userBalancesInMarket),
        userPositions: transformMarketOptionPositionToNumbers(userPositions),
      },
    })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
