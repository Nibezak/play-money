import Decimal from 'decimal.js'
import { UNIQUE_TRADER_BONUS_PRIMARY } from '@slimefish/finance/economy'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { getMarket } from './getMarket'
import { updateMarketBalances } from './updateMarketBalances'

export async function createMarketTraderBonusTransactions({ marketId }: { marketId: string }) {
  const [houseAccount, market] = await Promise.all([getHouseAccount(), getMarket({ id: marketId })])
  const creatorAccount = await getUserPrimaryAccount({ userId: market.createdBy })
  const amountToDistribute = new Decimal(UNIQUE_TRADER_BONUS_PRIMARY)
  if (amountToDistribute.lte(0)) return null

  const entries = [
    {
      amount: amountToDistribute,
      assetType: 'CURRENCY',
      assetId: 'PRIMARY',
      fromAccountId: houseAccount.id,
      toAccountId: creatorAccount.id,
    } as const,
  ]

  return executeTransaction({
    type: 'CREATOR_TRADER_BONUS',
    entries,
    marketId,
    additionalLogic: async (txParams) => updateMarketBalances({ ...txParams, marketId }),
  })
}
