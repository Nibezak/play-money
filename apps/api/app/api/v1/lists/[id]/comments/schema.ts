import zod from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { CommentSchema } from '@slimefish/database'

export default {
  get: {
    summary: 'Get comments for a list',
    parameters: zod.object({ id: zod.string() }),
    responses: {
      200: zod.object({ data: zod.array(CommentSchema) }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
