import { z } from 'zod';
import { Prisma } from '@prisma/client'

/////////////////////////////////////////
// MARKET VOLUME BUCKET SCHEMA
/////////////////////////////////////////

export const MarketVolumeBucketSchema = z.object({
  id: z.string().cuid(),
  marketId: z.string(),
  bucketStart: z.coerce.date(),
  volume: z.instanceof(Prisma.Decimal, { message: "Field 'volume' must be a Decimal. Location: ['Models', 'MarketVolumeBucket']"}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type MarketVolumeBucket = z.infer<typeof MarketVolumeBucketSchema>

export default MarketVolumeBucketSchema;
