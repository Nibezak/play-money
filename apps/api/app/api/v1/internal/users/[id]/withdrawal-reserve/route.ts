import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { getHouseAccount } from '@play-money/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@play-money/users/lib/getUserPrimaryAccount'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const expectedSecret = process.env.TELLWISE_SECRET
    if (!expectedSecret || req.headers.get('x-tellwise-secret') !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (req.headers.get('x-tellwise-internal-operation') !== 'risk-reviewed-withdrawal-reserve') {
      return NextResponse.json({ error: 'Missing internal risk approval' }, { status: 403 })
    }
    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, requestId?: unknown }
    const amount = new Decimal(String(body.amount ?? '0')).toDecimalPlaces(2)
    if (!amount.isFinite() || amount.lte(0) || amount.gt(1_000_000) || typeof body.requestId !== 'string') {
      return NextResponse.json({ error: 'Invalid withdrawal reservation' }, { status: 400 })
    }
    const [userAccount, houseAccount] = await Promise.all([getUserPrimaryAccount({ userId }), getHouseAccount()])
    const transaction = await executeTransaction({
      type: 'HOUSE_GIFT', initiatorId: userId,
      idempotencyKey: `withdrawal-reserve:${body.requestId}`,
      entries: [{ amount, assetType: 'CURRENCY', assetId: 'PRIMARY', fromAccountId: userAccount.id, toAccountId: houseAccount.id }],
    })
    return NextResponse.json({ data: { transactionId: transaction.id, requestId: body.requestId } })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Withdrawal reservation failed'
    return NextResponse.json({ error: /insufficient/i.test(message) ? 'Insufficient available balance' : message }, { status: /insufficient/i.test(message) ? 409 : 500 })
  }
}
