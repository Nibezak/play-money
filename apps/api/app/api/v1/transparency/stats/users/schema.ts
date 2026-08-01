import { z } from 'zod'
import { ApiEndpoints, ServerErrorSchema } from '@slimefish/api-helpers'

export default {
  get: {
    private: true,
    responses: {
      200: z.object({
        data: z.array(
          z.object({
            dau: z.number(),
            signups: z.number(),
            referrals: z.number(),
            startAt: z.date(),
            endAt: z.date(),
          })
        ),
      }),
      404: ServerErrorSchema,
      500: ServerErrorSchema,
    },
  },
} as const satisfies ApiEndpoints
