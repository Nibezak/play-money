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
      return NextResponse.json({ error: 'Unauthorized: Only admins can manage categories' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)

    const limitParam = Number.parseInt(searchParams.get('limit') || '50')
    const limit = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 100)

    const offsetParam = Number.parseInt(searchParams.get('offset') || '0')
    const offset = Number.isNaN(offsetParam) ? 0 : Math.max(offsetParam, 0)
    
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
    const mainOnly = searchParams.get('mainOnly') === '1'

    const whereClause: any = {}
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (mainOnly) {
      whereClause.isMainCategory = true
    }

    const [tags, count] = await Promise.all([
      db.tag.findMany({
        where: whereClause,
        orderBy: { [sortBy === 'created_at' ? 'createdAt' : sortBy === 'updated_at' ? 'updatedAt' : sortBy === 'name' ? 'name' : 'createdAt']: sortOrder },
        take: limit,
        skip: offset,
      }),
      db.tag.count({ where: whereClause })
    ])

    const data = tags.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      is_main_category: t.isMainCategory,
      is_hidden: t.isHidden,
      hide_events: t.hideEvents,
      display_order: 0,
      active_events_count: 0,
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
      tags: [],
    }))

    return NextResponse.json({ 
      data, 
      totalCount: count
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
