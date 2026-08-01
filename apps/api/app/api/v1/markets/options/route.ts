import { NextResponse } from 'next/server'
import { z } from 'zod'
import db from '@slimefish/database'

const RequestSchema = z.object({
  markets: z.array(z.string().min(1)).min(1).max(100),
})

function normalizeProbability(value: unknown) {
  const probability = Number(value)
  if (!Number.isFinite(probability)) return null
  return Math.max(0, Math.min(1, probability > 1 ? probability / 100 : probability))
}

export async function POST(request: Request) {
  try {
    const { markets } = RequestSchema.parse(await request.json())
    const requestedIds = Array.from(new Set(markets))
    const rows = await db.marketOption.findMany({
      where: { marketId: { in: requestedIds } },
      orderBy: [{ marketId: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        marketId: true,
        name: true,
        color: true,
        probability: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    const options = Object.fromEntries(requestedIds.map(marketId => [
      marketId,
      rows.filter(row => row.marketId === marketId).map(row => ({
        id: row.id,
        name: row.name,
        color: row.color,
        probability: normalizeProbability(row.probability),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    ]))

    return NextResponse.json({ options })
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid market-options request.' }, { status: 400 })
    }
    console.error('Market-options request failed', error)
    return NextResponse.json({ error: 'Failed to load market options.' }, { status: 500 })
  }
}
