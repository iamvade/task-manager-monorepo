import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch } from './common.js';

export const tagNameSchema = z.string().trim().min(1).max(40);

export const tagSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: paletteKeySchema,
  })
  .meta({ id: 'Tag' });
export type Tag = z.infer<typeof tagSchema>;

export const createTagSchema = z
  .object({ name: tagNameSchema, color: paletteKeySchema })
  .meta({ id: 'CreateTag' });
export type CreateTag = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({ name: tagNameSchema, color: paletteKeySchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateTag' });
export type UpdateTag = z.infer<typeof updateTagSchema>;

/** A tag with how many live (not deleted) tasks carry it: Settings → Tags. */
export const tagWithUsageSchema = tagSchema
  .extend({ taskCount: z.number().int().nonnegative() })
  .meta({ id: 'TagWithUsage' });
export type TagWithUsage = z.infer<typeof tagWithUsageSchema>;

export const mergeTagSchema = z.object({ intoTagId: z.uuid() }).meta({ id: 'MergeTag' });
export type MergeTag = z.infer<typeof mergeTagSchema>;
