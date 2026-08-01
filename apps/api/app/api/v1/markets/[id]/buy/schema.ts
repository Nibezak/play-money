import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'

export default {
  post: {
    summary: 'Buy an option in a market',
    security: true,
    parameters: z.object({ id: z.string() }),
    requestBody: z.object({
      optionId: z.string(),
      amount: z.number(),
      minShares: z.number().positive().optional(),
    }),
    responses: {
      200: z.object({
        data: z.object({
          success: z.boolean(),
          transactionId: z.string(),
          snapshot: z.object({
            marketId: z.string(),
            eventId: z.string().nullable(),
            status: z.enum(['active', 'closed', 'resolved', 'canceled']),
            version: z.number(),
            volume: z.number(),
            volume24h: z.number(),
            options: z.array(z.object({
              id: z.string(),
              name: z.string(),
              color: z.string(),
              probability: z.number(),
            })),
            user: z.object({
              balance: z.number(),
              positions: z.array(z.object({
                optionId: z.string(),
                cost: z.number(),
                quantity: z.number(),
                value: z.number(),
              })),
            }).nullable(),
          }),
        }),
      }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
