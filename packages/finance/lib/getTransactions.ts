import { getPaginatedItems, PaginationRequest } from '@play-money/api-helpers'
import db from '@play-money/database'
import { TransactionTypeType } from '@play-money/database/zod/inputTypeSchemas/TransactionTypeSchema'
import { TransactionWithEntries } from '../types'

interface TransactionFilterOptions {
  marketId?: string
  userId?: string
  accountId?: string
  transactionType?: Array<TransactionTypeType>
  isReverse?: boolean | null
}

export async function getTransactions(filters: TransactionFilterOptions = {}, pagination?: PaginationRequest) {
  return getPaginatedItems<TransactionWithEntries>({
    model: db.transaction,
    pagination: pagination ?? {},
    where: {
      marketId: filters.marketId,
      ...(filters.accountId
        ? {
            OR: [
              ...(filters.userId ? [{ initiatorId: filters.userId }] : []),
              { entries: { some: { fromAccountId: filters.accountId } } },
              { entries: { some: { toAccountId: filters.accountId } } },
            ],
          }
        : { initiatorId: filters.userId }),
      type: filters.transactionType ? { in: filters.transactionType } : undefined,
      isReverse: filters.isReverse,
    },
    include: {
      entries: true,
      market: { include: { event: true } },
      initiator: true,
      options: true,
    },
  })
}
