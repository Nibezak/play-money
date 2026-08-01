import zod from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { MarketActivitySchema } from '@slimefish/markets/types'

export default {
  get: {
    summary: 'Get all site activity',
    responses: {
      200: zod.object({ data: zod.array(MarketActivitySchema) }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
