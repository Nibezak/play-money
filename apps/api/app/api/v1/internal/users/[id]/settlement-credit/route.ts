import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { getHouseAccount } from '@play-money/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@play-money/users/lib/getUserPrimaryAccount'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (req.headers.get('x-tellwise-internal-operation') !== 'settlement-credit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, paymentIntentId?: unknown }
    const amount = new Decimal(String(body.amount ?? '0')).toDecimalPlaces(2)
    if (!amount.isFinite() || amount.lte(0) || amount.gt(1_000_000) || typeof body.paymentIntentId !== 'string') {
      return NextResponse.json({ error: 'Invalid settlement credit' }, { status: 400 })
    }
    const [userAccount, houseAccount] = await Promise.all([getUserPrimaryAccount({ userId }), getHouseAccount()])
    const transaction = await executeTransaction({
      type: 'HOUSE_GIFT',
      initiatorId: userId,
      idempotencyKey: `settlement-credit:${body.paymentIntentId}`,
      entries: [{ amount, assetType: 'CURRENCY', assetId: 'PRIMARY', fromAccountId: houseAccount.id, toAccountId: userAccount.id }],
    })
    return NextResponse.json({ data: { transactionId: transaction.id, replayed: transaction.replayed } })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement credit failed'
    return NextResponse.json({ error: message }, { status: /insufficient/i.test(message) ? 409 : 500 })
  }
}
