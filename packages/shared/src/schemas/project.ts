import { z } from 'zod';
import { paletteKeySchema, statusCategorySchema, templateIdSchema } from '../enums.js';
import { dateSchema } from '../dates.js';
import { projectKeySchema } from '../project-key.js';
import { NOTHING_TO_UPDATE, moveSchema, nonEmptyPatch } from './common.js';
import { workspaceMemberSchema } from './workspace.js';

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

export const statusSchema = z.object({
  id: z.uuid(),
  /** Null = default status; the UI shows the translated name for its category. */
  name: z.string().nullable(),
  category: statusCategorySchema,
  /** Null = the category's color. */
  color: z.string().nullable(),
  position: z.string(),
});
export type Status = z.infer<typeof statusSchema>;

export const sprintSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  startDate: dateSchema,
  endDate: dateSchema,
});
export type Sprint = z.infer<typeof sprintSchema>;

/** `GET /projects/:id` — header, board columns and counts. */
export const projectDetailSchema = projectSummarySchema.extend({
  space: z.object({
    id: z.uuid(),
    name: z.string(),
    initial: z.string(),
    color: paletteKeySchema,
  }),
  position: z.string(),
  createdAt: z.iso.datetime(),
  isFavorite: z.boolean(),
  /** By position. */
  statuses: z.array(statusSchema),
  /** The project's team, by name. */
  members: z.array(workspaceMemberSchema),
  /** The sprint covering today (caller's time zone), latest start first. */
  activeSprint: sprintSchema.nullable(),
  /** Non-deleted tasks per status (every status listed, zeros included). */
  taskCounts: z.array(z.object({ statusId: z.uuid(), count: z.number().int() })),
  taskCount: z.number().int(),
  doneCount: z.number().int(),
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const projectNameSchema = z.string().trim().min(1).max(80);

/** Without `key` the server picks a unique one from the name; `color` defaults by rotation. */
export const createProjectSchema = z.object({
  spaceId: z.uuid(),
  name: projectNameSchema,
  key: projectKeySchema.optional(),
  color: paletteKeySchema.optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({ name: projectNameSchema, key: projectKeySchema, color: paletteKeySchema })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE);
export type UpdateProject = z.infer<typeof updateProjectSchema>;

/** Reorder within a space, or move to `spaceId` (same workspace). */
export const moveProjectSchema = moveSchema.extend({ spaceId: z.uuid().optional() });
export type MoveProject = z.infer<typeof moveProjectSchema>;

export const applyTemplateSchema = z.object({ templateId: templateIdSchema });
export type ApplyTemplate = z.infer<typeof applyTemplateSchema>;

export const applyTemplateResponseSchema = z.object({
  createdCount: z.number().int(),
  project: projectDetailSchema,
});
export type ApplyTemplateResponse = z.infer<typeof applyTemplateResponseSchema>;

export const createSprintSchema = z
  .object({ name: z.string().trim().min(1).max(80), startDate: dateSchema, endDate: dateSchema })
  .refine((s) => s.endDate >= s.startDate, {
    message: 'The end date must not be before the start date',
    path: ['endDate'],
  });
export type CreateSprint = z.infer<typeof createSprintSchema>;
