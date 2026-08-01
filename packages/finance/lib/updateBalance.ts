import Decimal from 'decimal.js'
import { TransactionClient } from '@slimefish/database'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { AssetTypeType } from '@slimefish/database/zod/inputTypeSchemas/AssetTypeSchema'
import { NetBalance } from './getBalances'

type BalanceUpdate = {
  accountId: string
  assetType: AssetTypeType
  assetId: string
  change: Decimal
  marketId?: string
}

/** Apply the hot-path balance changes with one preload instead of rereading every row. */
export async function updateBalancesWithoutSubtotals({
  tx,
  changes,
  allowNegativeMarketOptionBalances = false,
}: {
  tx: TransactionClient
  changes: Array<BalanceUpdate>
  allowNegativeMarketOptionBalances?: boolean
}) {
  if (changes.length === 0) return

  const rows = changes.map(({ accountId, assetType, assetId, change, marketId }) => Prisma.sql`(
    ${randomUUID()}, ${accountId}, ${assetType}, ${assetId}, ${marketId ?? null},
    ${change.toString()}::numeric,
    ${allowNegativeMarketOptionBalances && assetType === 'MARKET_OPTION'}::boolean
  )`)

  const result = await tx.$queryRaw<Array<{ applied: bigint }>>(Prisma.sql`
    WITH changes(id, account_id, asset_type, asset_id, market_id, delta, allow_negative) AS (
      VALUES ${Prisma.join(rows)}
    ), updated AS (
      UPDATE "Balance" AS balance
      SET total = balance.total + changes.delta,
          "updatedAt" = NOW()
      FROM changes
      WHERE balance."accountId" = changes.account_id
        AND balance."assetType"::text = changes.asset_type
        AND balance."assetId" = changes.asset_id
        AND balance."marketId" IS NOT DISTINCT FROM changes.market_id
        AND (changes.delta >= 0 OR changes.allow_negative OR balance.total >= ABS(changes.delta))
      RETURNING balance.id
    ), inserted AS (
      INSERT INTO "Balance" (id, "accountId", "assetType", "assetId", total, subtotals, "marketId", "createdAt", "updatedAt")
      SELECT changes.id, changes.account_id, changes.asset_type::"AssetType", changes.asset_id,
             changes.delta, '{}'::jsonb, changes.market_id, NOW(), NOW()
      FROM changes
      WHERE (changes.delta >= 0 OR changes.allow_negative)
        AND NOT EXISTS (
          SELECT 1 FROM "Balance" AS balance
          WHERE balance."accountId" = changes.account_id
            AND balance."assetType"::text = changes.asset_type
            AND balance."assetId" = changes.asset_id
            AND balance."marketId" IS NOT DISTINCT FROM changes.market_id
        )
      RETURNING id
    )
    SELECT (SELECT COUNT(*) FROM updated) + (SELECT COUNT(*) FROM inserted) AS applied
  `)

  if (Number(result[0]?.applied ?? 0) !== changes.length) {
    throw new Error(changes.some(({ assetType, change }) => assetType === 'CURRENCY' && change.isNegative())
      ? 'Insufficient balance'
      : 'Insufficient market liquidity')
  }
}

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
