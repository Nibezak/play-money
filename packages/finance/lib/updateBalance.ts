import Decimal from 'decimal.js'
import { TransactionClient } from '@play-money/database'
import { AssetTypeType } from '@play-money/database/zod/inputTypeSchemas/AssetTypeSchema'
import { NetBalance } from './getBalances'

export async function updateBalance({
  tx,
  accountId,
  assetType,
  assetId,
  change,
  subtotals,
  marketId,
}: {
  tx: TransactionClient
  accountId: string
  assetType: AssetTypeType
  assetId: string
  change: Decimal
  subtotals?: Record<string, number>
  marketId?: string
}) {
  const existingBalance = await tx.balance.findFirst({
    where: {
      accountId,
      assetType,
      assetId,
      marketId: marketId ?? null,
    },
    select: { id: true },
  })

  if (change.isNegative()) {
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { type: true } })
    if (assetType === 'MARKET_OPTION' && account?.type === 'MARKET_CLEARING') {
      return tx.balance.upsert({
        where: { id: existingBalance?.id ?? '' },
        update: { total: { decrement: change.abs().toString() }, ...(subtotals ? { subtotals } : {}) },
        create: { accountId, assetType, assetId, total: change, marketId: marketId ?? null, subtotals: subtotals ?? {}, createdAt: new Date() },
      }) as unknown as NetBalance
    }
    if (!existingBalance) {
      throw new Error('Insufficient balance')
    }

    const debit = change.abs()
    const result = await tx.balance.updateMany({
      where: { id: existingBalance.id, total: { gte: debit } },
      data: { total: { decrement: debit.toString() }, ...(subtotals ? { subtotals } : {}) },
    })

    if (result.count !== 1) {
      console.error('Guarded balance debit rejected', {
        accountId,
        assetType,
        assetId,
        marketId: marketId ?? null,
        debit: debit.toString(),
      })
      throw new Error(assetType === 'CURRENCY' ? 'Insufficient balance' : 'Insufficient market liquidity')
    }

    return tx.balance.findUniqueOrThrow({ where: { id: existingBalance.id } }) as unknown as NetBalance
  }

  return tx.balance.upsert({
    where: { id: existingBalance?.id ?? '' },
    update: {
      total: { increment: change.toString() },
      ...(subtotals ? { subtotals } : {}),
    },
    create: {
      accountId,
      assetType,
      assetId,
      total: change,
      marketId: marketId ?? null,
      subtotals: subtotals ?? {},
      createdAt: new Date(),
    },
  }) as unknown as NetBalance
}
