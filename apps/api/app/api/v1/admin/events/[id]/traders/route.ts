import { NextResponse } from 'next/server'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import db from '@slimefish/database'
import { getStaffUser, hasStaffRole } from '../../../auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await getAuthUser(req)
    if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getStaffUser(req, actorId)
    if (!hasStaffRole(actor)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: eventId } = await params
    const rows = await db.transaction.groupBy({
      by: ['initiatorId'],
      where: {
        initiatorId: { not: null },
        type: { in: ['TRADE_BUY', 'TRADE_SELL'] },
        market: { eventId },
      },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: 500,
    })

    const userIds = rows.map(row => row.initiatorId).filter((id): id is string => Boolean(id))
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, email: true, avatarUrl: true, role: true, depositWalletAddress: true, address: true },
        })
      : []
    const usersById = new Map(users.map(user => [user.id, user]))

    return NextResponse.json({
      data: rows.map(row => ({
        user: usersById.get(row.initiatorId ?? ''),
        tradeCount: row._count._all,
        firstTradeAt: row._min.createdAt,
        lastTradeAt: row._max.createdAt,
      })).filter(row => row.user),
    })
  }
  catch (error) {
    console.error('Failed to fetch event traders', error)
    return NextResponse.json({ error: 'Could not fetch event traders right now.' }, { status: 500 })
  }
}
