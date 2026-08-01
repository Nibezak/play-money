import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'

export default {
  post: {
    summary: 'Get a quote for a market',
    parameters: z.object({ id: z.string() }),
    requestBody: z.object({ optionId: z.string(), amount: z.number(), isBuy: z.boolean().optional() }),
    responses: {
      200: z.object({
        data: z.object({
          currentProbability: z.number(),
          newProbability: z.number(),
          sharesPurchased: z.number(),
          totalPayout: z.number(),
          // Kept during the frontend transition. This is the same value as totalPayout.
          potentialReturn: z.number(),
          feeAmount: z.number(),
          netAmount: z.number(),
          feeBps: z.number().int().nonnegative(),
        }),
      }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
