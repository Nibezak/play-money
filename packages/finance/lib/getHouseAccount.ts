import db from '@slimefish/database'

export async function getHouseAccount() {
  const account = await db.account.findUnique({
    where: {
      internalType: 'HOUSE',
    },
  })

  if (!account) {
    throw new Error('House account does not exist')
  }

  return account
}
