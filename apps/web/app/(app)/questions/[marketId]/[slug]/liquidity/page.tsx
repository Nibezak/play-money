import React from 'react'
import { getExtendedMarket, getMarketLiquidityTransactions } from '@slimefish/api-helpers/client'
import { MarketLiquidityPage } from '@slimefish/markets/components/MarketLiquidityPage'

export default async function AppPostsSlugPage({ params }: { params: { marketId: string } }) {
  const { data: market } = await getExtendedMarket({ marketId: params.marketId })
  const { data: transactions, pageInfo } = await getMarketLiquidityTransactions({ marketId: params.marketId })
  const userLiquidity = transactions.filter((t) => t.initiatorId)

  return <MarketLiquidityPage liquidityTransactions={userLiquidity} market={market} pageInfo={pageInfo} />
}
