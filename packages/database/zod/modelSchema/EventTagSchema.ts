import { z } from 'zod';

/////////////////////////////////////////
// EVENT TAG SCHEMA
/////////////////////////////////////////

export const EventTagSchema = z.object({
  eventId: z.string(),
  tagId: z.string(),
})

export type EventTag = z.infer<typeof EventTagSchema>

export default EventTagSchema;
