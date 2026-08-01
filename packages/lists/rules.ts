import { List } from '@slimefish/database'
import { User } from '@slimefish/database'
import { isAdmin } from '@slimefish/users/rules'

export function canAddToList({ list, userId }: { list: List; userId?: string }) {
  return list.contributionPolicy === 'PUBLIC' || (list.contributionPolicy === 'OWNERS_ONLY' && list.ownerId === userId)
}

export function canModifyList({ list, user }: { list: List; user: User }) {
  return list.ownerId === user.id || isAdmin({ user })
}
