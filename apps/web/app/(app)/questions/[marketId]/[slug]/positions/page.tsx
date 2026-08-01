import React from 'react'
import { getExtendedMarket, getMarketPositions } from '@slimefish/api-helpers/client'
import { MarketPositionsPage } from '@slimefish/markets/components/MarketPositionsPage'

export default async function AppPostsSlugPage({ params }: { params: { marketId: string } }) {
  const { data: market } = await getExtendedMarket({ marketId: params.marketId })
  const { data: marketPositions } = await getMarketPositions({
    marketId: params.marketId,
    status: 'active',
    limit: 100,
  })

  return <MarketPositionsPage market={market} positions={marketPositions} />
}
