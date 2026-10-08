import { z } from 'zod';

/** Every API error response: `{ error: { code, message } }`. */
export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .meta({ id: 'ApiError' });
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
