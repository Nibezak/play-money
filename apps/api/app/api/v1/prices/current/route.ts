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
      where: { id: { in: requestedIds } },
      select: { id: true, probability: true },
    })
    const prices = Object.fromEntries(rows.flatMap((row) => {
      const probability = normalizeProbability(row.probability)
      return probability == null ? [] : [[row.id, probability]]
    }))

    return NextResponse.json({ prices })
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid current-price request.' }, { status: 400 })
    }
    console.error('Current-price request failed', error)
    return NextResponse.json({ error: 'Failed to load current prices.' }, { status: 500 })
  }
}
