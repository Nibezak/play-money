import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { DAILY_COMMENT_BONUS_PRIMARY } from '@slimefish/finance/economy'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { createReferralBonusTransactions } from '@slimefish/referrals/lib/createReferralBonusTransactions'
import { isNewlyReferredUser } from '@slimefish/referrals/lib/helpers'

export async function createDailyCommentBonusTransaction({
  accountId,
  initiatorId,
  marketId,
}: {
  accountId: string
  initiatorId: string
  marketId?: string
}) {
  const [houseAccount, user] = await Promise.all([
    getHouseAccount(),
    db.user.findFirstOrThrow({
      where: {
        primaryAccountId: accountId,
      },
    }),
  ])
  const payout = new Decimal(DAILY_COMMENT_BONUS_PRIMARY)
  if (payout.lte(0)) return null

  const entries = [
    {
      amount: payout,
      assetType: 'CURRENCY',
      assetId: 'PRIMARY',
      fromAccountId: houseAccount.id,
      toAccountId: accountId,
    } as const,
  ]

  const transaction = await executeTransaction({
    type: 'DAILY_COMMENT_BONUS',
    initiatorId,
    entries,
    marketId,
  })

  if (isNewlyReferredUser(user)) {
    await createReferralBonusTransactions({
      user,
      initiatorId,
      marketId,
      payout,
    })
  }

  return transaction
}
