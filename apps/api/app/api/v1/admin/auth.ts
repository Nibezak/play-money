import db from '@slimefish/database'

export async function getStaffUser(req: Request, userId: string) {
  const email = req.headers.get('x-tellwise-user-email')?.trim().toLowerCase()
  return db.user.findFirst({
    where: email
      ? { OR: [{ id: userId }, { email: { equals: email, mode: 'insensitive' } }] }
      : { id: userId },
  })
}

export function hasStaffRole(user: { role: string } | null | undefined) {
  return Boolean(user && user.role !== 'USER')
}

export function canMoveFunds(user: { role: string } | null | undefined) {
  return Boolean(user && (user.role === 'ADMIN' || user.role === 'FINANCE'))
}
