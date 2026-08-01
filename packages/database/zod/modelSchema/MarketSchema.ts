import { z } from 'zod';
import { JsonValueSchema } from '../inputTypeSchemas/JsonValueSchema'
import { Prisma } from '@prisma/client'

/////////////////////////////////////////
// MARKET SCHEMA
/////////////////////////////////////////

export const MarketSchema = z.object({
  id: z.string().cuid(),
  question: z.string().trim().min(1, { message: "Question is required" }),
  description: z.string(),
  slug: z.string().min(1, { message: "Slug is required" }),
  closeDate: z.coerce.date().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  canceledAt: z.coerce.date().nullable(),
  canceledById: z.string().nullable(),
  createdBy: z.string(),
  tags: z.string().trim().array().max(5),
  ammAccountId: z.string(),
  clearingAccountId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  eventId: z.string().nullable(),
  oracle: z.string().nullable(),
  questionId: z.string().nullable(),
  creatorAddress: z.string().nullable(),
  resolutionStatus: z.string().nullable(),
  clobTokenIds: JsonValueSchema,
  commentCount: z.number().int().nullable(),
  uniqueTradersCount: z.number().int().nullable(),
  uniquePromotersCount: z.number().int().nullable(),
  liquidityCount: z.number().int().nullable(),
  volume: z.instanceof(Prisma.Decimal, { message: "Field 'volume' must be a Decimal. Location: ['Models', 'Market']"}),
  parentListId: z.string().nullable(),
})

export type Market = z.infer<typeof MarketSchema>

export default MarketSchema;
