import Decimal from 'decimal.js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@play-money/auth/lib/getAuthUser'
import { executeTransaction } from '@play-money/finance/lib/executeTransaction'
import { getHouseAccount } from '@play-money/finance/lib/getHouseAccount'
import { getUserById } from '@play-money/users/lib/getUserById'
import { getUserPrimaryAccount } from '@play-money/users/lib/getUserPrimaryAccount'

const STAFF_ROLES = new Set(['ADMIN', 'FINANCE'])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await getAuthUser(req)
    if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await getUserById({ id: actorId })
    if (!STAFF_ROLES.has(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: userId } = await params
    const body = await req.json() as { amount?: unknown, direction?: unknown }
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
    const transaction = await executeTransaction({
      type: 'HOUSE_GIFT',
      initiatorId: actorId,
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
    const status = /insufficient/i.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
