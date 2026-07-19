import { NextResponse } from 'next/server'
import { getAuthUser } from '@play-money/auth/lib/getAuthUser'
import db from '@play-money/database'
import { getUserById } from '@play-money/users/lib/getUserById'
import { isAdmin } from '@play-money/users/rules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserById({ id: userId })
    if (!isAdmin({ user })) {
      return NextResponse.json({ error: 'Unauthorized: Only admins can manage events' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)

    const limitParam = Number.parseInt(searchParams.get('limit') || '50')
    const limit = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 100)

    const offsetParam = Number.parseInt(searchParams.get('offset') || '0')
    const offset = Number.isNaN(offsetParam) ? 0 : Math.max(offsetParam, 0)
    
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    const whereClause: any = {}
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Since we just added Event model to Play-Money, we will query it.
    const [events, count] = await Promise.all([
      db.event.findMany({
        where: whereClause,
        orderBy: { [sortBy === 'created_at' ? 'createdAt' : sortBy === 'updated_at' ? 'updatedAt' : sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          markets: true
        }
      }),
      db.event.count({ where: whereClause })
    ])

    // Format events for Tellwise
    const data = events.map(e => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      status: e.status,
      icon_url: e.iconUrl || '',
      livestream_url: e.livestreamUrl,
      series_slug: null, // Stubbed for now
      series_recurrence: null,
      volume: e.markets.reduce((acc, m) => acc, 0), // To be implemented later with real AMM volumes
      volume_24h: 0,
      is_hidden: e.isHidden,
      sports_score: null,
      sports_live: null,
      sports_ended: null,
      is_sports_games_moneyline: false,
      end_date: e.endDate ? e.endDate.toISOString() : null,
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
    }))

    return NextResponse.json({ 
      data, 
      totalCount: count,
      creatorOptions: [],
      seriesOptions: []
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}
