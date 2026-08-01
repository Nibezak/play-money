import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { canMoveFunds, getStaffUser } from '../../../auth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await getAuthUser(req)
    if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getStaffUser(req, actorId)
    if (!canMoveFunds(actor)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, direction?: unknown, idempotencyKey?: unknown }
    const amount = new Decimal(String(body.amount ?? '0'))
    if (!amount.isFinite() || amount.lte(0) || amount.gt(1000000)) {
      return NextResponse.json({ error: 'Amount must be between 0 and 1,000,000' }, { status: 400 })
    }
    if (body.direction !== 'deposit' && body.direction !== 'withdraw') {
      return NextResponse.json({ error: 'Direction must be deposit or withdraw' }, { status: 400 })
    }

    const [userAccount, houseAccount] = await Promise.all([
      getUserPrimaryAccount({ userId }),
      getHouseAccount(),
    ])
    const isDeposit = body.direction === 'deposit'
    const requestId = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : req.headers.get('idempotency-key')?.trim() || randomUUID()
    const transaction = await executeTransaction({
      type: 'HOUSE_GIFT',
      initiatorId: actorId,
      idempotencyKey: `admin-balance-adjustment:${actorId}:${userId}:${requestId}`,
      entries: [{
        amount,
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        fromAccountId: isDeposit ? houseAccount.id : userAccount.id,
        toAccountId: isDeposit ? userAccount.id : houseAccount.id,
      }],
    })
    return NextResponse.json({ data: { transactionId: transaction.id } })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Balance adjustment failed'
    if (/insufficient|below zero/i.test(message)) {
      return NextResponse.json({ error: 'Insufficient available balance' }, { status: 409 })
    }
    console.error('Balance adjustment failed', error)
    return NextResponse.json({ error: 'Could not apply that balance adjustment right now.' }, { status: 500 })
  }
}
