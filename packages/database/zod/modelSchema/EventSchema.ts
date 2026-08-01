import { z } from 'zod';

/////////////////////////////////////////
// EVENT SCHEMA
/////////////////////////////////////////

export const EventSchema = z.object({
  id: z.string().cuid(),
  slug: z.string(),
  title: z.string(),
  creator: z.string().nullable(),
  iconUrl: z.string().nullable(),
  isHidden: z.boolean(),
  livestreamUrl: z.string().nullable(),
  additionalContext: z.string().nullable(),
  additionalContextUpdatedAt: z.coerce.date().nullable(),
  showMarketIcons: z.boolean(),
  status: z.string(),
  marketMode: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  startDate: z.coerce.date().nullable(),
  endDate: z.coerce.date().nullable(),
  resolvedAt: z.coerce.date().nullable(),
})

export type Event = z.infer<typeof EventSchema>

export default EventSchema;
