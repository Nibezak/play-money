import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import db, { MarketSchema, MarketOption, MarketOptionSchema } from '@slimefish/database'
import { INITIAL_MARKET_LIQUIDITY_PRIMARY } from '@slimefish/finance/economy'
import { getBalance } from '@slimefish/finance/lib/getBalances'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { createMarketLiquidityTransaction } from './createMarketLiquidityTransaction'
import { getMarketTagsLLM } from './getMarketTagsLLM'
import { slugifyTitle } from './helpers'

type PartialOptions = Pick<MarketOption, 'name' | 'color'> & { id?: string, probability?: number }

export async function createMarket({
  id,
  question,
  description,
  closeDate,
  createdBy,
  options,
  tags,
  subsidyAmount = new Decimal(INITIAL_MARKET_LIQUIDITY_PRIMARY),
  liquidityAccountId,
  parentListId,
  eventId,
}: {
  id?: string
  question: string
  description: string
  closeDate: Date | null
  createdBy: string
  options?: Array<PartialOptions>
  tags?: Array<string>
  subsidyAmount?: Decimal
  liquidityAccountId?: string
  parentListId?: string
  eventId?: string
}) {
  let slug = slugifyTitle(question)

  let parsedOptions: Array<PartialOptions>

  if (options?.length) {
    parsedOptions = options.map((data) => {
      const parsed = MarketOptionSchema.pick({ name: true, color: true }).parse(data)
      const probability = Number(data.probability)
      return { ...parsed, id: data.id, probability: Number.isFinite(probability) && probability > 0 && probability < 1 ? probability : undefined }
    })
  } else {
    parsedOptions = [
      {
        name: 'Yes',
        color: '#3B82F6',
      },
      {
        name: 'No',
        color: '#EC4899',
      },
    ]
  }

  const liquidityAccount = liquidityAccountId
    ? { id: liquidityAccountId }
    : createdBy === 'system-admin'
      ? await getHouseAccount()
      : await getUserPrimaryAccount({ userId: createdBy })

  const liquidityBalance = await getBalance({
    accountId: liquidityAccount.id,
    assetType: 'CURRENCY',
    assetId: 'PRIMARY',
  })

  if (!liquidityBalance.total.gte(subsidyAmount)) {
    throw new Error(liquidityAccountId || createdBy === 'system-admin'
      ? 'Treasury does not have enough ledger balance to allocate market liquidity'
      : 'User does not have enough balance to create market')
  }

  const generatedTags = tags ?? (await getMarketTagsLLM({ question }))

  const now = new Date()
  const createdMarket = await db.market.create({
    data: {
      ...(id ? { id } : {}),
      question,
      description,
      closeDate,
      slug,
      tags: generatedTags.map((tag) => slugifyTitle(tag)),
      ...(eventId
        ? {
            event: {
              connect: { id: eventId },
            },
          }
        : {}),
      options: {
        createMany: {
          data: parsedOptions.map((option, i) => ({
            ...(option.id ? { id: option.id } : {}),
            name: option.name,
            color: option.color || (i === 0 ? '#3B82F6' : '#EC4899'),
            liquidityProbability: new Decimal(option.probability ?? new Decimal(1).div(parsedOptions.length)),
            probability: option.probability ?? new Decimal(1).div(parsedOptions.length).toNumber(),
            createdAt: new Date(now.getTime() + i), // Stagger createdAt so that they can be ordered by creation
          })),
        },
      },
      ...(parentListId
        ? {
            parentList: {
              connect: {
                id: parentListId,
              },
            } as unknown as undefined,
            lists: {
              create: {
                listId: parentListId,
              },
            },
          }
        : {}),

      commentCount: 0,
      liquidityCount: 0,
      uniquePromotersCount: 0,
      uniqueTradersCount: 0,

      // @case: Borked the TS for these relations during the financial rewrite, not sure how to fix.
      ammAccountId: undefined as unknown as string,
      ammAccount: {
        create: {
          type: 'MARKET_AMM' as const,
        },
      } as unknown as undefined,
      clearingAccountId: undefined as unknown as string,
      clearingAccount: {
        create: {
          type: 'MARKET_CLEARING' as const,
        },
      } as unknown as undefined,
      createdBy: undefined as unknown as string,
      user: {
        connect: {
          id: createdBy,
        },
      } as unknown as undefined,
    } as unknown as Prisma.MarketCreateInput,
    include: {
      options: true,
    },
  })

  await Promise.all([
    db.account.update({
      where: {
        id: createdMarket.ammAccountId,
      },
      data: {
        marketId: createdMarket.id,
        updatedAt: new Date(),
      },
    }),
    db.account.update({
      where: {
        id: createdMarket.clearingAccountId,
      },
      data: {
        marketId: createdMarket.id,
        updatedAt: new Date(),
      },
    }),
  ])

  await createMarketLiquidityTransaction({
    type: 'LIQUIDITY_INITIALIZE',
    initiatorId: createdBy,
    accountId: liquidityAccount.id,
    amount: subsidyAmount,
    marketId: createdMarket.id,
  })

  return createdMarket
}
