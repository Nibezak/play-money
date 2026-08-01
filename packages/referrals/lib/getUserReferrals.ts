import db from '@slimefish/database'

export async function getUserReferrals({ userId }: { userId: string }) {
  return db.user.findMany({
    where: {
      referredBy: userId,
    },
  })
}
