import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { addLiquidity } from '@slimefish/markets/lib/addLiquidity'
import { publishFreshPublicMarketSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'
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
    const { amount } = schema.post.requestBody.parse(body)

    await addLiquidity({
      userId,
      amount: new Decimal(amount),
      marketId: id,
    })
    await publishFreshPublicMarketSnapshots([id])

    return NextResponse.json({
      data: {
        success: true,
      },
    })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
