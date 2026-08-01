import { NextResponse } from 'next/server'
import { getPublicMarketLiveSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'
import {
  publishPublicSnapshots,
  readCachedPublicSnapshots,
} from '@slimefish/markets/lib/liveSnapshotCache'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const ids = Array.from(
    new Set(new URL(request.url).searchParams.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean) || [])
  )

  if (ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ error: 'Provide between 1 and 50 market ids.' }, { status: 400 })
  }

  try {
    const cached = await readCachedPublicSnapshots(ids)
    const missingIds = ids.filter((id) => !cached.has(id))
    const fresh = missingIds.length > 0 ? await getPublicMarketLiveSnapshots(missingIds) : []
    if (fresh.length > 0) await publishPublicSnapshots(fresh)
    for (const snapshot of fresh) cached.set(snapshot.marketId, snapshot)
    const snapshots = ids.flatMap((id) => {
      const snapshot = cached.get(id)
      return snapshot ? [snapshot] : []
    })
    return NextResponse.json(
      { data: snapshots },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Server-Timing': `live-cache;desc="${missingIds.length === 0 ? 'hit' : 'fill'}"`,
          'X-Live-Source': missingIds.length === 0 ? 'cache' : 'database',
        },
      }
    )
  } catch (error) {
    console.error('Failed to load live market snapshots', error)
    return NextResponse.json({ error: 'Failed to load live market snapshots.' }, { status: 500 })
  }
}
