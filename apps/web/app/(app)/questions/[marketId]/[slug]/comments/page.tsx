import React from 'react'
import { getExtendedMarket } from '@slimefish/api-helpers/client'
import { MarketComments } from '@slimefish/markets/components/MarketComments'
import { MarketCommentsPage } from '@slimefish/markets/components/MarketCommentsPage'

export default async function AppPostsSlugPage({ params }: { params: { marketId: string } }) {
  const { data: market } = await getExtendedMarket({ marketId: params.marketId })

  return <MarketCommentsPage market={market} renderComments={<MarketComments marketId={market.id} />} />
}
