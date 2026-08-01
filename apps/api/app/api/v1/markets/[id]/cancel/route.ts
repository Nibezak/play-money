import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { cancelMarket } from '@slimefish/markets/lib/cancelMarket'
import { publishFreshPublicMarketSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'
import { getMarket } from '@slimefish/markets/lib/getMarket'
import { canModifyMarket } from '@slimefish/markets/rules'
import { getUserById } from '@slimefish/users/lib/getUserById'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = schema.post.parameters.parse(params)

    const body = (await req.json()) as unknown
    const { reason } = schema.post.requestBody.parse(body)

    const market = await getMarket({ id, extended: true })
    const cancelingUser = await getUserById({ id: userId })

    if (!canModifyMarket({ market, user: cancelingUser })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await cancelMarket({
      canceledById: userId,
      marketId: id,
      reason,
    })
    await publishFreshPublicMarketSnapshots([id])

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
