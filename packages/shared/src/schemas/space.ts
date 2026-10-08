import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch } from './common.js';

export const spaceNameSchema = z.string().trim().min(1).max(60);
/** One or two characters shown in the space badge. */
export const spaceInitialSchema = z.string().trim().min(1).max(2);

export const spaceSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  initial: z.string(),
  color: paletteKeySchema,
  position: z.string(),
});
export type Space = z.infer<typeof spaceSchema>;

/** `initial` defaults to the name's first letter. */
export const createSpaceSchema = z.object({
  name: spaceNameSchema,
  color: paletteKeySchema,
  initial: spaceInitialSchema.optional(),
});
export type CreateSpace = z.infer<typeof createSpaceSchema>;

export const updateSpaceSchema = z
  .object({ name: spaceNameSchema, color: paletteKeySchema, initial: spaceInitialSchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE);
export type UpdateSpace = z.infer<typeof updateSpaceSchema>;
