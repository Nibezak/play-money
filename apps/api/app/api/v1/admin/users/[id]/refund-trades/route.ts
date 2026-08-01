import { NextResponse } from 'next/server'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import db from '@slimefish/database'
import { calculateBalanceChanges } from '@slimefish/finance/lib/helpers'
import { updateGlobalBalances } from '@slimefish/finance/lib/updateGlobalBalances'
import { updateMarketBalances } from '@slimefish/markets/lib/updateMarketBalances'
import { canMoveFunds, getStaffUser } from '../../../auth'

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await getAuthUser(req)
    if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getStaffUser(req, actorId)
    if (!canMoveFunds(actor)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: userId } = await params
    const body = await req.json().catch(() => ({})) as {
      marketId?: unknown
      eventId?: unknown
      from?: unknown
      to?: unknown
      reason?: unknown
    }
    const from = parseDate(body.from)
    const to = parseDate(body.to)
    if (body.from && !from) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 })
    if (body.to && !to) return NextResponse.json({ error: 'Invalid end date' }, { status: 400 })
    if (from && to && from > to) return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })

    const marketId = typeof body.marketId === 'string' && body.marketId.trim() ? body.marketId.trim() : undefined
    const eventId = typeof body.eventId === 'string' && body.eventId.trim() ? body.eventId.trim() : undefined
    const transactions = await db.transaction.findMany({
      where: {
        initiatorId: userId,
        type: { in: ['TRADE_BUY', 'TRADE_SELL'] },
        isReverse: null,
        ...(marketId ? { marketId } : {}),
        ...(eventId ? { market: { eventId } } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { entries: true, options: true },
      orderBy: { createdAt: 'desc' },
    })

    let refundedCount = 0
    for (const transaction of transactions) {
      const reverseTransactionExists = await db.transaction.findFirst({ where: { reverseOfId: transaction.id } })
      if (reverseTransactionExists) continue

      const { id: _, createdAt: __, updatedAt: ___, entries: _entries, options, ...deconstructedTransaction } = transaction
      await db.$transaction(async (tx) => {
        const reverseTransaction = await tx.transaction.create({
          data: {
            ...deconstructedTransaction,
            isReverse: true,
            reverseOfId: transaction.id,
            entries: {
              createMany: {
                data: transaction.entries.map(({ id: _entryId, transactionId: _transactionId, createdAt: _createdAt, fromAccountId, toAccountId, ...entry }) => ({
                  ...entry,
                  fromAccountId: toAccountId,
                  toAccountId: fromAccountId,
                })),
              },
            },
            options: { connect: options?.map(({ id }) => ({ id })) },
          },
          include: { entries: true, options: true },
        })

        const balanceChanges = calculateBalanceChanges({ entries: reverseTransaction.entries })
        await Promise.all([
          updateGlobalBalances({ tx, transactionType: reverseTransaction.type, balanceChanges }),
          reverseTransaction.marketId
            ? updateMarketBalances({ tx, transactionType: reverseTransaction.type, balanceChanges, marketId: reverseTransaction.marketId })
            : Promise.resolve(),
        ])
      }, { maxWait: 15_000, timeout: 120_000 })
      refundedCount += 1
    }

    return NextResponse.json({ data: { refundedCount } })
  }
  catch (error) {
    console.error('Refund failed', error)
    return NextResponse.json({ error: 'Could not refund those trades right now.' }, { status: 500 })
  }
}
