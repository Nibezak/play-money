import { NextResponse } from 'next/server'
import db from '@slimefish/database'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { publishAccountSnapshot, readCachedAccountSnapshot } from '@slimefish/markets/lib/liveSnapshotCache'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: userId } = await params
    const cached = await readCachedAccountSnapshot(userId)
    if (cached) {
      const { userId: _userId, ...data } = cached
      return NextResponse.json({ data })
    }
    const account = await getUserPrimaryAccount({ userId })
    const [balance, positions] = await Promise.all([
      db.balance.findFirst({
        where: {
          accountId: account.id,
          assetType: 'CURRENCY',
          assetId: 'PRIMARY',
          marketId: null,
        },
        select: { total: true, updatedAt: true },
      }),
      db.marketOptionPosition.findMany({
        where: { accountId: account.id },
        select: {
          marketId: true,
          optionId: true,
          cost: true,
          quantity: true,
          value: true,
          updatedAt: true,
          option: { select: { name: true } },
          market: {
            select: {
              options: {
                orderBy: { createdAt: 'asc' },
                select: { id: true },
              },
            },
          },
        },
      }),
    ])

    const version = Math.max(
      account.updatedAt.getTime(),
      balance?.updatedAt.getTime() ?? 0,
      ...positions.map(position => position.updatedAt.getTime()),
    )

    const snapshot = await publishAccountSnapshot({
      userId,
      version,
      balance: Number(balance?.total || 0),
      positions: positions.map(position => ({
        marketId: position.marketId,
        optionId: position.optionId,
        optionName: position.option.name,
        outcomeIndex: Math.max(0, position.market.options.findIndex(option => option.id === position.optionId)),
        cost: Number(position.cost),
        quantity: Number(position.quantity),
        value: Number(position.value),
      })),
    })
    const { userId: _userId, ...data } = snapshot
    return NextResponse.json({
      data,
    })
  }
  catch (error) {
    console.error('Failed to load live account snapshot', error)
    return NextResponse.json({ error: 'Failed to load account snapshot' }, { status: 500 })
  }
}
