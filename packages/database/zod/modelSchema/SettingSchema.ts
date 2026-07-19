import { z } from 'zod';

/////////////////////////////////////////
// SETTING SCHEMA
/////////////////////////////////////////

export const SettingSchema = z.object({
  id: z.number().int(),
  group: z.string(),
  key: z.string(),
  value: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Setting = z.infer<typeof SettingSchema>

export default SettingSchema;
