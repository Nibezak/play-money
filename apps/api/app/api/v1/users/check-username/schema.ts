import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { UserSchema } from '@slimefish/database'

export default {
  get: {
    summary: 'Check if a username is available',
    parameters: UserSchema.pick({ username: true }),
    responses: {
      200: z.object({ data: z.object({ available: z.boolean(), message: z.string().optional() }) }),
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
