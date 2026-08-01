import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { finalizeMarketBuy, marketBuy } from '@slimefish/markets/lib/marketBuy'
import { publishFreshMarketLiveBundle } from '@slimefish/markets/lib/getMarketLiveSnapshot'
import { readCachedPublicSnapshots } from '@slimefish/markets/lib/liveSnapshotCache'
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

    // Warm the public read model while the ledger transaction is committing.
    // On a cache miss this avoids adding a full Neon round trip after commit.
    const publicSnapshotPromise = readCachedPublicSnapshots([id]).then((cached) => cached.get(id))

    const body = (await req.json()) as unknown
    const { optionId, amount, minShares } = schema.post.requestBody.parse(body)
    const suppliedKey = req.headers.get('idempotency-key')?.trim()
    if (!suppliedKey || suppliedKey.length < 8 || suppliedKey.length > 200) {
      return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 })
    }
    const idempotencyKey = `trade-buy:${userId}:${id}:${createHash('sha256').update(suppliedKey).digest('hex')}`

    const transaction = await marketBuy({
      marketId: id,
      optionId,
      amount: new Decimal(amount),
      minShares: minShares === undefined ? undefined : new Decimal(minShares),
      userId,
      idempotencyKey,
    })
    if (transaction.replayed) {
      const { snapshot } = await publishFreshMarketLiveBundle({ marketId: id, userId })
      return NextResponse.json({
        data: {
          success: true,
          transactionId: transaction.id,
          snapshot: {
            ...snapshot,
            options: snapshot.options.map(option => ({ ...option, color: option.color ?? '' })),
          },
        },
      })
    }

    const publicSnapshot = (await publicSnapshotPromise) ?? transaction.publicSnapshotSeed
    if (!publicSnapshot) throw new Error('Market live snapshot not found')
    const snapshot = {
      ...publicSnapshot,
      volume: publicSnapshot.volume + new Decimal(amount).toNumber(),
      volume24h: publicSnapshot.volume24h + new Decimal(amount).toNumber(),
      version: Math.max(Date.now(), publicSnapshot.version + 1),
      user: {
        balance: transaction.receipt.balance,
        positions: [transaction.receipt.position],
      },
    }
    if (!transaction.replayed) {
      // `marketBuy` completes its probability refresh before returning. Do not
      // reference the removed deferred promise here: that previously made a
      // committed trade look like a failed request to the client.
      void publishFreshMarketLiveBundle({ marketId: id, userId })
        .catch((error) => {
          console.error('Post-trade live snapshot rebuild failed', { transactionId: transaction.id, error })
        })
      void finalizeMarketBuy({
            marketId: id,
            optionId,
            userId,
            amount: new Decimal(amount),
            transactionId: transaction.id,
          })
        .catch((error) => {
          console.error('Post-trade bookkeeping failed', { transactionId: transaction.id, error })
        })
    }
    return NextResponse.json({
      data: {
        success: true,
        transactionId: transaction.id,
        snapshot: {
          ...snapshot,
          options: snapshot.options.map(option => ({ ...option, color: option.color ?? '' })),
        },
      },
    })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    const message = error instanceof Error ? error.message : String(error)
    const normalized = message.toLowerCase()
    let status = 500
    if (normalized.includes('suspended')) status = 403
    else if (normalized.includes('already entered')) status = 409
    else if (/insufficient|enough\s+balance|liquidity|slippage|price moved/i.test(message)) status = 422
    else if (normalized.includes('positive value')) status = 400
    if (/prisma|transaction already closed|transaction api error|invocation/i.test(message)) {
      return NextResponse.json({ error: 'The ledger is temporarily busy. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status })
  }
}
