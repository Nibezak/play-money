import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@play-money/api-helpers'
import { getAuthUser } from '@play-money/auth/lib/getAuthUser'
import { getBalance } from '@play-money/finance/lib/getBalances'
import { getUserPrimaryAccount } from '@play-money/users/lib/getUserPrimaryAccount'
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
    })

    return NextResponse.json({ data: { balance: primaryBalance.total.toNumber() } })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Failed to retrieve user session' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createHouseUserGiftTransaction } = await import('@play-money/finance/lib/createHouseUserGiftTransaction')
    const Decimal = (await import('decimal.js')).default
    
    // Give the user 100 play money
    await createHouseUserGiftTransaction({
      userId: userId,
      amount: new Decimal(100),
      initiatorId: userId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.log(error)
    return NextResponse.json({ error: 'Failed to credit test money' }, { status: 500 })
  }
}
