import { z } from 'zod';

/////////////////////////////////////////
// TAG TRANSLATION SCHEMA
/////////////////////////////////////////

export const TagTranslationSchema = z.object({
  tagId: z.string(),
  locale: z.string(),
  name: z.string(),
  sourceHash: z.string(),
  isManual: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type TagTranslation = z.infer<typeof TagTranslationSchema>

export default TagTranslationSchema;
