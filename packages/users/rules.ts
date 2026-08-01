import { User } from '@slimefish/database'

export function isAdmin({ user }: { user: User }) {
  return user.role === 'ADMIN'
}
