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
    if (user.role === 'USER') {
      return NextResponse.json({ error: 'Unauthorized: Staff access required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)

    const limitParam = Number.parseInt(searchParams.get('limit') || '50')
    const limit = Number.isNaN(limitParam) ? 50 : Math.min(limitParam, 100)

    const offsetParam = Number.parseInt(searchParams.get('offset') || '0')
    const offset = Number.isNaN(offsetParam) ? 0 : Math.max(offsetParam, 0)
    
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    const whereClause: any = {}
    if (search) {
      whereClause.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { depositWalletAddress: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Map sortBy to Prisma fields
    let orderByField = 'createdAt'
    if (sortBy === 'username') orderByField = 'username'
    if (sortBy === 'email') orderByField = 'email'
    if (sortBy === 'address') orderByField = 'address'

    const [users, count] = await Promise.all([
      db.user.findMany({
        where: whereClause,
        orderBy: { [orderByField]: sortOrder },
        take: limit,
        skip: offset,
      }),
      db.user.count({ where: whereClause })
    ])

    return NextResponse.json({ data: users, count, totalCount: count })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

const MANAGEABLE_ROLES = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const

export async function PATCH(req: Request) {
  try {
    const adminId = await getAuthUser(req)
    if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await getUserById({ id: adminId })
    if (!isAdmin({ user: admin })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as { userId?: unknown, tradingBlocked?: unknown, role?: unknown }
    if (typeof body.userId !== 'string' || !body.userId.trim()) {
      return NextResponse.json({ error: 'A valid user id is required' }, { status: 400 })
    }
    if (body.userId === adminId && body.tradingBlocked === true) {
      return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id: body.userId }, select: { settings: true } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const settings = existing.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
      ? existing.settings as Record<string, unknown>
      : {}
    const data: Record<string, unknown> = {}
    if (typeof body.tradingBlocked === 'boolean') {
      data.settings = { ...settings, tradingBlocked: body.tradingBlocked }
    }
    if (typeof body.role === 'string') {
      if (!MANAGEABLE_ROLES.includes(body.role as typeof MANAGEABLE_ROLES[number])) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      data.role = body.role
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid changes supplied' }, { status: 400 })
    }

    const updated = await db.user.update({ where: { id: body.userId }, data, select: { id: true, role: true, settings: true } })
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Admin user update failed:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
