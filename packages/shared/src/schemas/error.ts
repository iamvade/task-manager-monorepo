import { z } from 'zod';

/** Every API error response: `{ error: { code, message } }`. */
export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      /** Per-field error codes, when a form can show them next to its fields. */
      fields: z.record(z.string(), z.string()).optional(),
    }),
  })
  .meta({ id: 'ApiError' });
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
