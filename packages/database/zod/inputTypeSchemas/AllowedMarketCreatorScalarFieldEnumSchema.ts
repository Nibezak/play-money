import { z } from 'zod';

export const AllowedMarketCreatorScalarFieldEnumSchema = z.enum(['walletAddress','displayName','sourceUrl','sourceType','createdAt','updatedAt']);

export default AllowedMarketCreatorScalarFieldEnumSchema;
