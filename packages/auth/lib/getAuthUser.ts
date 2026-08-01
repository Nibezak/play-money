import { createHash, timingSafeEqual } from 'node:crypto'
import db from '@slimefish/database'
import { createUser } from '@slimefish/users/lib/createUser'

export async function getAuthUser(request: Request): Promise<string | null> {
  const tellwiseSecret = request.headers.get('x-tellwise-secret')
  const tellwiseUserId = request.headers.get('x-tellwise-user-id')
  const configuredSecret = process.env.TELLWISE_SERVICE_SECRET?.trim()
    || process.env.TELLWISE_SECRET?.trim()
    || (process.env.NODE_ENV === 'development' ? 'tellwise_super_secret_bypass_key_123' : '')
  const isValidServiceSecret = Boolean(
    tellwiseSecret
    && configuredSecret
    && tellwiseSecret.length === configuredSecret.length
    && timingSafeEqual(Buffer.from(tellwiseSecret), Buffer.from(configuredSecret)),
  )
  if (isValidServiceSecret && tellwiseUserId) {
    const isAdmin = request.headers.get('x-tellwise-is-admin') === 'true'
    const requestedRole = request.headers.get('x-tellwise-role')?.toUpperCase()
    const allowedRoles = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const
    const resolvedRole = isAdmin
      ? 'ADMIN'
      : allowedRoles.includes(requestedRole as typeof allowedRoles[number])
        ? requestedRole as typeof allowedRoles[number]
        : undefined
    const forwardedEmail = request.headers.get('x-tellwise-user-email')?.trim().toLowerCase()
    let existing = await db.user.findUnique({ where: { id: tellwiseUserId } })
    if (!existing && forwardedEmail) {
      existing = await db.user.findUnique({ where: { email: forwardedEmail } })
    }
    if (!existing) {
      const usernameSuffix = createHash('sha256').update(tellwiseUserId).digest('hex').slice(0, 16)
      existing = await createUser({
        id: tellwiseUserId,
        email: forwardedEmail || `${tellwiseUserId}@tellwise.local`,
        username: `tellwise_${usernameSuffix}`,
      })
    }
    
    if (resolvedRole && existing.role !== resolvedRole) {
      await db.user.update({
        where: { id: existing.id },
        data: { role: resolvedRole }
      })
    }
    return existing.id
  }

  const { auth } = await import('@slimefish/auth')
  const session = await auth()
  if (session?.user?.id) {
    return session.user.id
  }

  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return null
  }

  const hashedApiKey = createHash('sha256').update(apiKey).digest('hex')
  const apiKeyRecord = await db.apiKey.findFirst({
    where: {
      key: { in: [hashedApiKey, apiKey] },
      isRevoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
    },
  })

  if (!apiKeyRecord) {
    return null
  }

  if (apiKey !== hashedApiKey) {
    await db.apiKey.update({ where: { id: apiKeyRecord.id }, data: { key: hashedApiKey } })
  }

  // Update last used timestamp
  await db.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  })

  return apiKeyRecord.userId
}
