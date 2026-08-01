import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import db from '@slimefish/database'
import { getMarketTransactionsTimeSeries } from '@slimefish/markets/lib/getMarketTransactionsTimeSeries'
import {
  cacheMarketHistory,
  readCachedMarketHistory,
  readLiveOptionHistories,
} from '@slimefish/markets/lib/liveSnapshotCache'

const RequestSchema = z.object({
  markets: z.array(z.string().min(1)).min(1).max(20),
  startTs: z.number().int().positive().optional(),
  endTs: z.number().int().positive().optional(),
  fidelity: z.number().positive().max(24 * 60).optional(),
  interval: z.string().optional(),
})

function normalizeProbability(value: unknown) {
  const probability = Number(value)
  if (!Number.isFinite(probability)) return 0
  return Math.max(0, Math.min(1, probability > 1 ? probability / 100 : probability))
}

export async function POST(request: Request) {
  try {
    const { markets: requestedIds, startTs, endTs, fidelity } = RequestSchema.parse(await request.json())
    const normalizedRequest = {
      markets: Array.from(new Set(requestedIds)).sort(),
      startTs: startTs ? Math.floor(startTs / 60) * 60 : undefined,
      endTs: endTs ? Math.floor(endTs / 60) * 60 : undefined,
      fidelity,
    }
    const cacheSignature = createHash('sha256')
      .update(JSON.stringify(normalizedRequest))
      .digest('hex')
    const cached = await readCachedMarketHistory(cacheSignature)
    if (cached) {
      return new NextResponse(cached, {
        headers: {
          'content-type': 'application/json',
          'x-live-source': 'cache',
        },
      })
    }
    const liveHistory = await readLiveOptionHistories(normalizedRequest.markets, startTs, endTs)
    if (normalizedRequest.markets.every(optionId => (liveHistory.get(optionId)?.length ?? 0) > 0)) {
      const responseBody = JSON.stringify({
        history: Object.fromEntries(normalizedRequest.markets.map(optionId => [optionId, liveHistory.get(optionId)])),
      })
      await cacheMarketHistory(cacheSignature, responseBody)
      return new NextResponse(responseBody, {
        headers: {
          'content-type': 'application/json',
          'x-live-source': 'redis-history',
        },
      })
    }
    const optionRows = await db.marketOption.findMany({
      where: { id: { in: Array.from(new Set(requestedIds)) } },
      select: { id: true, marketId: true, probability: true, createdAt: true },
    })
    const marketIds = Array.from(new Set(optionRows.map(option => option.marketId)))
    const seriesEntries = await Promise.all(marketIds.map(async marketId => (
      [marketId, await getMarketTransactionsTimeSeries({
        marketId,
        startAt: startTs ? new Date(startTs * 1000) : undefined,
        endAt: endTs ? new Date(endTs * 1000) : undefined,
        tickInterval: fidelity ? Math.max(fidelity / 60, 1 / 60) : 1,
        excludeTransactionTypes: ['TRADE_LOSS', 'TRADE_WIN', 'LIQUIDITY_RETURNED'],
      })] as const
    )))
    const seriesByMarket = new Map(seriesEntries)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const history = Object.fromEntries(requestedIds.map((optionId) => {
      const option = optionRows.find(row => row.id === optionId)
      if (!option) return [optionId, []]

      const points = (seriesByMarket.get(option.marketId) ?? []).flatMap((point) => {
        const value = point.options.find(current => current.id === optionId)
        const timestamp = new Date(point.endAt).getTime()
        return value && Number.isFinite(timestamp)
          ? [{ t: Math.floor(timestamp / 1000), p: normalizeProbability(value.probability) }]
          : []
      })
      if (points.length > 0) return [optionId, points]

      const createdSeconds = Math.floor(option.createdAt.getTime() / 1000)
      const probability = normalizeProbability(option.probability)
      return [optionId, [
        { t: createdSeconds, p: probability },
        { t: Math.max(createdSeconds + 1, nowSeconds), p: probability },
      ]]
    }))

    const responseBody = JSON.stringify({ history })
    await cacheMarketHistory(cacheSignature, responseBody)
    return new NextResponse(responseBody, {
      headers: {
        'content-type': 'application/json',
        'x-live-source': 'database',
      },
    })
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid price history request.' }, { status: 400 })
    }
    console.error('Price history request failed', error)
    return NextResponse.json({ error: 'Failed to load price history.' }, { status: 500 })
  }
}
