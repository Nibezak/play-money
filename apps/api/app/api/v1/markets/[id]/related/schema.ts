import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { MarketSchema } from '@slimefish/database'

export default {
  get: {
    summary: 'Get related markets',
    parameters: z.object({ id: z.string() }),
    responses: {
      200: z.object({ data: z.array(MarketSchema) }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
