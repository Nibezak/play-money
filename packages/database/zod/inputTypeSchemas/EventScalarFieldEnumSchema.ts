import { z } from 'zod';

export const EventScalarFieldEnumSchema = z.enum(['id','slug','title','creator','iconUrl','isHidden','livestreamUrl','additionalContext','additionalContextUpdatedAt','showMarketIcons','status','marketMode','createdAt','updatedAt','startDate','endDate','resolvedAt']);

export default EventScalarFieldEnumSchema;
