import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch } from './common.js';

export const tagNameSchema = z.string().trim().min(1).max(40);

export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: paletteKeySchema,
});
export type Tag = z.infer<typeof tagSchema>;

export const createTagSchema = z.object({ name: tagNameSchema, color: paletteKeySchema });
export type CreateTag = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({ name: tagNameSchema, color: paletteKeySchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE);
export type UpdateTag = z.infer<typeof updateTagSchema>;
