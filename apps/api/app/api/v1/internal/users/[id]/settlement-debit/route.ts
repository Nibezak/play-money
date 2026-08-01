import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.TELLWISE_SECRET || req.headers.get('x-tellwise-secret') !== process.env.TELLWISE_SECRET || req.headers.get('x-tellwise-internal-operation') !== 'settlement-debit') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, operationId?: unknown }
    const amount = new Decimal(String(body.amount ?? '0')).toDecimalPlaces(2)
    if (!amount.isFinite() || amount.lte(0) || amount.gt(1_000_000) || typeof body.operationId !== 'string') {
      return NextResponse.json({ error: 'Invalid settlement debit' }, { status: 400 })
    }
    const [userAccount, houseAccount] = await Promise.all([getUserPrimaryAccount({ userId }), getHouseAccount()])
    const transaction = await executeTransaction({
      type: 'HOUSE_GIFT',
      initiatorId: userId,
      idempotencyKey: `settlement-debit:${body.operationId}`,
      entries: [{ amount, assetType: 'CURRENCY', assetId: 'PRIMARY', fromAccountId: userAccount.id, toAccountId: houseAccount.id }],
    })
    return NextResponse.json({ data: { transactionId: transaction.id, replayed: transaction.replayed } })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement debit failed'
    if (/insufficient|below zero/i.test(message)) {
      return NextResponse.json({ error: 'Insufficient available balance' }, { status: 409 })
    }
    console.error('Settlement debit failed', error)
    return NextResponse.json({ error: 'Could not debit this settlement right now.' }, { status: 500 })
  }
}
