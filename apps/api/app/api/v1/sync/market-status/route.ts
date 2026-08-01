import { NextResponse } from 'next/server'
import db from '@slimefish/database'
import { publishFreshPublicMarketSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    eventId?: unknown
    marketIds?: unknown
    status?: unknown
  } | null
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const marketIds = Array.isArray(body?.marketIds)
    ? body.marketIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []

  if (body?.status !== 'closed' || (!eventId && marketIds.length === 0)) {
    return NextResponse.json({ error: 'A market or event and the closed status are required.' }, { status: 400 })
  }

  const closedAt = new Date()
  const result = await db.$transaction(async (tx) => {
    const lockScope = eventId || marketIds.slice().sort().join(':')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'market-status:' + lockScope}))`
    const updated = await tx.market.updateMany({
      where: eventId && marketIds.length > 0
        ? { OR: [{ eventId }, { id: { in: marketIds } }] }
        : eventId ? { eventId } : { id: { in: marketIds } },
      data: { closeDate: closedAt, updatedAt: closedAt },
    })
    if (eventId) {
      await tx.event.updateMany({ where: { id: eventId }, data: { status: 'closed', endDate: closedAt } })
    }
    return updated
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'No AMM markets matched this event.' }, { status: 404 })
  }

  const closedMarketIds = marketIds.length > 0
    ? marketIds
    : (await db.market.findMany({ where: { eventId }, select: { id: true } })).map(market => market.id)
  await publishFreshPublicMarketSnapshots(closedMarketIds)

  return NextResponse.json({ success: true, closedAt: closedAt.toISOString(), marketsClosed: result.count })
}
