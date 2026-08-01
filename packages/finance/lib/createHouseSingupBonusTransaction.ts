import Decimal from 'decimal.js'
import { INITIAL_USER_BALANCE_PRIMARY } from '@slimefish/finance/economy'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { executeTransaction } from './executeTransaction'

export async function createHouseSingupBonusTransaction({ userId }: { userId: string }) {
  const [userAccount, houseAccount] = await Promise.all([getUserPrimaryAccount({ userId }), getHouseAccount()])

  const entries = [
    {
      amount: new Decimal(INITIAL_USER_BALANCE_PRIMARY),
      assetType: 'CURRENCY',
      assetId: 'PRIMARY',
      fromAccountId: houseAccount.id,
      toAccountId: userAccount.id,
    } as const,
  ]

  const transaction = await executeTransaction({
    type: 'HOUSE_SIGNUP_BONUS',
    entries,
  })

  return transaction
}
