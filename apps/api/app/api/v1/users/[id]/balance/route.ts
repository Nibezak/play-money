import { NextResponse } from 'next/server'
import Decimal from 'decimal.js'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getBalance, transformMarketBalancesToNumbers } from '@slimefish/finance/lib/getBalances'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const { id } = schema.get.parameters.parse(params)
    const userAccount = await getUserPrimaryAccount({ userId: id })
    const balance = await getBalance({ accountId: userAccount.id, assetType: 'CURRENCY', assetId: 'PRIMARY' })
      .catch((error) => {
        if (error instanceof Error && error.message === 'No balance') {
          const now = new Date()
          return {
            id: `zero:${userAccount.id}:PRIMARY`,
            accountId: userAccount.id,
            assetType: 'CURRENCY' as const,
            assetId: 'PRIMARY',
            total: new Decimal(0),
            subtotals: {},
            marketId: null,
            createdAt: now,
            updatedAt: now,
          }
        }
        throw error
      })

    return NextResponse.json({
      data: {
        balance: transformMarketBalancesToNumbers([balance])[0],
      },
    })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
