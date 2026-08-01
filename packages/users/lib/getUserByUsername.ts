import db from '@slimefish/database'
import { UserNotFoundError } from './exceptions'

export async function getUserByUsername({ username }: { username: string }) {
  const user = await db.user.findUnique({
    where: {
      username,
    },
  })

  if (!user) {
    throw new UserNotFoundError(`User with username "${username}" not found`)
  }

  return user
}
