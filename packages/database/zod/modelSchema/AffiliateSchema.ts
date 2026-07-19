import { z } from 'zod';

/////////////////////////////////////////
// AFFILIATE SCHEMA
/////////////////////////////////////////

export const AffiliateSchema = z.object({
  id: z.string().cuid(),
  code: z.string(),
  rate: z.number(),
  isActive: z.boolean(),
  parentId: z.string().nullable(),
  ltv: z.number(),
  clickCount: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Affiliate = z.infer<typeof AffiliateSchema>

export default AffiliateSchema;
