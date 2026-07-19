import { z } from 'zod';

export const TransactionScalarFieldEnumSchema = z.enum(['id','externalId','type','initiatorId','isReverse','reverseOfId','createdAt','updatedAt','batchId','marketId']);

export default TransactionScalarFieldEnumSchema;
