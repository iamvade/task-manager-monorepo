import { z } from 'zod';
import { paletteKeySchema } from '../enums.js';

export const projectSummarySchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  spaceId: z.uuid(),
  key: z.string(),
  name: z.string(),
  color: paletteKeySchema,
  archivedAt: z.iso.datetime().nullable(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
