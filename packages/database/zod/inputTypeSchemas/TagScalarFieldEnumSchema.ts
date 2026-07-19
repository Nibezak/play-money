import { z } from 'zod';

export const TagScalarFieldEnumSchema = z.enum(['id','name','slug','isMainCategory','isHidden','hideEvents','createdAt','updatedAt']);

export default TagScalarFieldEnumSchema;
