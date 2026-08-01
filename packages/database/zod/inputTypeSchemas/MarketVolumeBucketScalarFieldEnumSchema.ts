import { z } from 'zod';

export const MarketVolumeBucketScalarFieldEnumSchema = z.enum(['id','marketId','bucketStart','volume','createdAt','updatedAt']);

export default MarketVolumeBucketScalarFieldEnumSchema;
