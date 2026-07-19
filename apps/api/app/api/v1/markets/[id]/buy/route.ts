import Decimal from 'decimal.js'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@play-money/api-helpers'
import { getAuthUser } from '@play-money/auth/lib/getAuthUser'
import { marketBuy } from '@play-money/markets/lib/marketBuy'
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
    const { optionId, amount } = schema.post.requestBody.parse(body)
    const suppliedKey = req.headers.get('idempotency-key')?.trim()
    if (!suppliedKey || suppliedKey.length < 8 || suppliedKey.length > 200) {
      return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 })
    }
    const idempotencyKey = `trade-buy:${userId}:${id}:${createHash('sha256').update(suppliedKey).digest('hex')}`

    await marketBuy({
      marketId: id,
      optionId,
      amount: new Decimal(amount),
      userId,
      idempotencyKey,
    })

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    const message = error instanceof Error ? error.message : String(error)
    const normalized = message.toLowerCase()
    let status = 500
    if (normalized.includes('suspended')) status = 403
    else if (normalized.includes('already entered')) status = 409
    else if (/insufficient|enough\s+balance|liquidity/i.test(message)) status = 422
    else if (normalized.includes('positive value')) status = 400
    if (/prisma|transaction already closed|transaction api error|invocation/i.test(message)) {
      return NextResponse.json({ error: 'The ledger is temporarily busy. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status })
  }
}
