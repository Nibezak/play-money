import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getMarketQuote } from '@slimefish/markets/lib/getMarketQuote'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const { id } = schema.post.parameters.parse(params)

    const body = (await req.json()) as unknown
    const { optionId, amount, isBuy = true } = schema.post.requestBody.parse(body)

    const { currentProbability, probability, shares, feeAmount, netAmount, feeBps } = await getMarketQuote({
      marketId: id,
      optionId,
      amount: new Decimal(amount),
      isBuy,
    })

    return NextResponse.json({
      data: {
        currentProbability: currentProbability.toNumber(),
        newProbability: probability.toNumber(),
        sharesPurchased: shares.toNumber(),
        totalPayout: shares.toNumber(),
        potentialReturn: shares.toNumber(),
        feeAmount: feeAmount.toNumber(),
        netAmount: netAmount.toNumber(),
        feeBps,
      },
    })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
