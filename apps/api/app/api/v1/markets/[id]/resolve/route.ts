import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { getMarket } from '@slimefish/markets/lib/getMarket'
import { resolveMarket } from '@slimefish/markets/lib/resolveMarket'
import { publishFreshPublicMarketSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'
import { isMarketCanceled } from '@slimefish/markets/rules'
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
    const { optionId, supportingLink } = schema.post.requestBody.parse(body)

    const market = await getMarket({ id, extended: true })
    const resolvingUser = await getUserById({ id: userId })

    if (!['ADMIN', 'RESOLVER', 'MODERATOR'].includes(resolvingUser.role) || isMarketCanceled({ market })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await resolveMarket({
      resolverId: userId,
      marketId: id,
      optionId,
      supportingLink,
    })
    await publishFreshPublicMarketSnapshots([id])

    return NextResponse.json({ data: result })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    if (error instanceof Error) {
      if (/prisma|transaction already closed|transaction api error|invocation/i.test(error.message)) {
        return NextResponse.json({ error: 'The ledger is temporarily busy. Please try again.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
