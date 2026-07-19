import { z } from 'zod';
import { JsonValueSchema } from '../inputTypeSchemas/JsonValueSchema'

/////////////////////////////////////////
// EVENT CREATION SCHEMA
/////////////////////////////////////////

export const EventCreationSchema = z.object({
  id: z.string().cuid(),
  createdByUserId: z.string(),
  updatedByUserId: z.string().nullable(),
  title: z.string(),
  slug: z.string().nullable(),
  creationMode: z.string(),
  status: z.string(),
  startAt: z.coerce.date().nullable(),
  deployAt: z.coerce.date().nullable(),
  endDate: z.coerce.date().nullable(),
  walletAddress: z.string().nullable(),
  draftPayload: JsonValueSchema,
  assetPayload: JsonValueSchema,
  mainCategorySlug: z.string().nullable(),
  categorySlugs: z.string().array(),
  marketMode: z.string().nullable(),
  binaryQuestion: z.string().nullable(),
  binaryOutcomeYes: z.string().nullable(),
  binaryOutcomeNo: z.string().nullable(),
  resolutionSource: z.string().nullable(),
  resolutionRules: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type EventCreation = z.infer<typeof EventCreationSchema>

export default EventCreationSchema;
