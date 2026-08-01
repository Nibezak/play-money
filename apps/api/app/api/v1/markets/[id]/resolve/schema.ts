import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'

export default {
  post: {
    summary: 'Resolve a market',
    security: true,
    parameters: z.object({ id: z.string() }),
    requestBody: z.object({ optionId: z.string(), supportingLink: z.string().optional() }),
    responses: {
      200: z.object({
        data: z.object({
          success: z.boolean(),
          recipients: z.array(z.object({
            userId: z.string(),
            payout: z.number(),
            won: z.boolean(),
          })),
        }),
      }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
