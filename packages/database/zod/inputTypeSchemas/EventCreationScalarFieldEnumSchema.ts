import { z } from 'zod';

export const EventCreationScalarFieldEnumSchema = z.enum(['id','createdByUserId','updatedByUserId','title','slug','creationMode','status','startAt','deployAt','endDate','walletAddress','draftPayload','assetPayload','mainCategorySlug','categorySlugs','marketMode','binaryQuestion','binaryOutcomeYes','binaryOutcomeNo','resolutionSource','resolutionRules','createdAt','updatedAt']);

export default EventCreationScalarFieldEnumSchema;
