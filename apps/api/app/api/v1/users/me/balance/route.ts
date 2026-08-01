import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { getBalance } from '@slimefish/finance/lib/getBalances'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import type schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userAccount = await getUserPrimaryAccount({ userId })
    const primaryBalance = await getBalance({
      accountId: userAccount.id,
      assetType: 'CURRENCY',
      assetId: 'PRIMARY',
    }).catch((error) => {
      if (error instanceof Error && error.message === 'No balance') return null
      throw error
    })

    return NextResponse.json({ data: { balance: primaryBalance?.total.toNumber() ?? 0 } })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Failed to retrieve user session' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  await getAuthUser(req)
  return NextResponse.json({ error: 'Direct balance grants are disabled.' }, { status: 405 })
}
