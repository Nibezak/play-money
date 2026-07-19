import { z } from 'zod';

export const AffiliateScalarFieldEnumSchema = z.enum(['id','code','rate','isActive','parentId','ltv','clickCount','createdAt','updatedAt']);

export default AffiliateScalarFieldEnumSchema;
