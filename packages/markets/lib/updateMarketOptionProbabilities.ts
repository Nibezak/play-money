import { TransactionClient } from '@slimefish/database'
import { NetBalance } from '@slimefish/finance/lib/getBalances'
import { marketOptionBalancesToProbabilities } from '@slimefish/finance/lib/helpers'
import { getMarket } from './getMarket'

export async function updateMarketOptionProbabilities({
  tx,
  balances,
  marketId,
}: {
  tx: TransactionClient
  balances: Array<NetBalance>
  marketId: string
}) {
  const market = await getMarket({ id: marketId })
  const ammBalances = balances.filter((balance) => balance.accountId === market.ammAccountId)
  const probabilities = marketOptionBalancesToProbabilities(ammBalances)

  await Promise.all(
    Object.entries(probabilities).map(([optionId, probability]) =>
      tx.marketOption.update({
        where: {
          id: optionId,
        },
        data: {
          probability,
          updatedAt: new Date(),
        },
      })
    )
  )
}
