import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'
import { MarketSchema } from '@slimefish/database'

export default {
  post: {
    summary: 'Add liquidity to a market',
    security: true,
    parameters: MarketSchema.pick({ id: true }),
    requestBody: z.object({ amount: z.number() }),
    responses: {
      200: z.object({
        data: z.object({
          success: z.boolean(),
        }),
      }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
