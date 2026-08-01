import { NextResponse } from 'next/server'
import { createUser } from '@slimefish/users/lib/createUser'
import db from '@slimefish/database'

export async function POST(req: Request) {
  const secret = req.headers.get('x-tellwise-secret')
  const expectedSecret = process.env.TELLWISE_SECRET
  const localDevelopmentSecret = 'tellwise_super_secret_bypass_key_123'
  const isAuthorized = Boolean(secret) && (
    secret === expectedSecret
    || (process.env.NODE_ENV !== 'production' && secret === localDevelopmentSecret)
  )
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawBody = await req.text()
    if (!rawBody.trim()) {
      return NextResponse.json({ error: 'Missing user sync payload' }, { status: 400 })
    }
    const body = JSON.parse(rawBody)
    const { id, username, email, isAdmin, role } = body
    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
    }
    const allowedRoles = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const
    const resolvedRole = isAdmin === true
      ? 'ADMIN'
      : allowedRoles.includes(role)
        ? role
        : undefined

    // A Tellwise database can be restored independently from Slimefish ledger. In that
    // case the same person may have a different Tellwise id, but their Slimefish ledger
    // account (and its ledger history) must remain canonical.
    let user = await db.user.findUnique({ where: { id } })

    if (!user && email) {
      user = await db.user.findUnique({ where: { email } })
    }
    
    if (!user) {
      user = await createUser({
        id,
        username,
        email: email || `${id}@tellwise.local`,
      })
    }

    if (resolvedRole && user.role !== resolvedRole) {
      user = await db.user.update({
        where: { id: user.id },
        data: { role: resolvedRole },
      })
    }

    return NextResponse.json({ success: true, user, userId: user.id })
  } catch (error: any) {
    console.error('Error syncing user:', error)
    return NextResponse.json({ error: 'Could not sync user right now.' }, { status: 500 })
  }
}
