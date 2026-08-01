import Decimal from 'decimal.js'
import db, { User } from '@slimefish/database'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { createNotification } from '@slimefish/notifications/lib/createNotification'
import { getUserById } from '@slimefish/users/lib/getUserById'

export async function createReferralBonusTransactions({
  user,
  initiatorId,
  marketId,
  payout,
}: {
  user: User
  initiatorId: string
  marketId?: string
  payout: Decimal
}) {
  if (payout.lte(0)) return

  const referringUser = user.referredBy ? await getUserById({ id: user.referredBy }) : null
  const houseAccount = await getHouseAccount()

  if (referringUser) {
    const transaction = await executeTransaction({
      type: 'REFERRER_BONUS',
      initiatorId,
      entries: [
        {
          amount: payout,
          assetType: 'CURRENCY',
          assetId: 'PRIMARY',
          fromAccountId: houseAccount.id,
          toAccountId: referringUser.primaryAccountId,
        },
      ],
      marketId,
    })

    await executeTransaction({
      type: 'REFERREE_BONUS',
      initiatorId,
      entries: [
        {
          amount: payout,
          assetType: 'CURRENCY',
          assetId: 'PRIMARY',
          fromAccountId: houseAccount.id,
          toAccountId: user.primaryAccountId,
        },
      ],
      marketId,
    })

    await createNotification({
      type: 'REFERRER_BONUS',
      actorId: initiatorId,
      marketId,
      transactionId: transaction.id,
      groupKey: 'REFERRER_BONUS',
      userId: referringUser.id,
      actionUrl: `/settings/referrals`,
    })
  }
}
