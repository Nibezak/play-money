import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.TELLWISE_SECRET || req.headers.get('x-tellwise-secret') !== process.env.TELLWISE_SECRET || req.headers.get('x-tellwise-internal-operation') !== 'withdrawal-release') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, requestId?: unknown }
    const amount = new Decimal(String(body.amount ?? '0')).toDecimalPlaces(2)
    if (!amount.isFinite() || amount.lte(0) || typeof body.requestId !== 'string') return NextResponse.json({ error: 'Invalid release' }, { status: 400 })
    const [userAccount, houseAccount] = await Promise.all([getUserPrimaryAccount({ userId }), getHouseAccount()])
    const transaction = await executeTransaction({ type: 'HOUSE_GIFT', initiatorId: userId, idempotencyKey: `withdrawal-release:${body.requestId}`, entries: [{ amount, assetType: 'CURRENCY', assetId: 'PRIMARY', fromAccountId: houseAccount.id, toAccountId: userAccount.id }] })
    return NextResponse.json({ data: { transactionId: transaction.id } })
  }
  catch (error) {
    console.error('Withdrawal release failed', error)
    return NextResponse.json({ error: 'Could not release withdrawal funds right now.' }, { status: 500 })
  }
}
