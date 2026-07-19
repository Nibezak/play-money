import { z } from 'zod';

export const MarketOptionScalarFieldEnumSchema = z.enum(['id','name','marketId','color','liquidityProbability','createdAt','updatedAt','probability','tokenId']);

export default MarketOptionScalarFieldEnumSchema;
