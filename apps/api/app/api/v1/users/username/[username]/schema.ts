import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { UserSchema } from '@slimefish/database'

export default {
  get: {
    summary: 'Get a user by username',
    parameters: UserSchema.pick({ username: true }),
    responses: {
      200: z.object({ data: UserSchema }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
