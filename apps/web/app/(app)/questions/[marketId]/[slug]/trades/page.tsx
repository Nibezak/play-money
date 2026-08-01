import { getExtendedMarket, getMarketTransactions } from '@slimefish/api-helpers/client'
import { MarketTradesPage } from '@slimefish/markets/components/MarketTradesPage'

export default async function AppPostsSlugPage({
  params,
  searchParams,
}: {
  params: { marketId: string }
  searchParams: { limit?: string; cursor?: string }
}) {
  const { data: market } = await getExtendedMarket({ marketId: params.marketId })
  const { data: transactions = [], pageInfo } = await getMarketTransactions({
    marketId: params.marketId,
    limit: searchParams.limit ? Number(searchParams.limit) : undefined,
    cursor: searchParams.cursor,
  })

  return <MarketTradesPage market={market} pageInfo={pageInfo} transactions={transactions} />
}
