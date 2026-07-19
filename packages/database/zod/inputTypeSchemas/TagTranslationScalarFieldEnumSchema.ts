import { z } from 'zod';

export const TagTranslationScalarFieldEnumSchema = z.enum(['tagId','locale','name','sourceHash','isManual','createdAt','updatedAt']);

export default TagTranslationScalarFieldEnumSchema;
