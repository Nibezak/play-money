import { z } from 'zod';

/////////////////////////////////////////
// ALLOWED MARKET CREATOR SCHEMA
/////////////////////////////////////////

export const AllowedMarketCreatorSchema = z.object({
  walletAddress: z.string(),
  displayName: z.string(),
  sourceUrl: z.string().nullable(),
  sourceType: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type AllowedMarketCreator = z.infer<typeof AllowedMarketCreatorSchema>

export default AllowedMarketCreatorSchema;
