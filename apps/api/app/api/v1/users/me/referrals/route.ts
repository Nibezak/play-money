import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { getUserReferrals } from '@slimefish/referrals/lib/getUserReferrals'
import type schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const referrals = await getUserReferrals({ userId })

    return NextResponse.json({ data: referrals })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Failed to retrieve user session' }, { status: 500 })
  }
}
