import { z } from 'zod';
import { paletteKeySchema, statusCategorySchema, templateIdSchema } from '../enums.js';
import { dateSchema } from '../dates.js';
import { projectKeySchema } from '../project-key.js';
import { richTextDocSchema, richTextNodeSchema } from '../rich-text.js';
import { NOTHING_TO_UPDATE, moveSchema, nonEmptyPatch } from './common.js';
import { workspaceMemberSchema } from './workspace.js';

export const projectSummarySchema = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    spaceId: z.uuid(),
    key: z.string(),
    name: z.string(),
    color: paletteKeySchema,
    archivedAt: z.iso.datetime().nullable(),
    /** Who created it (may archive / restore it like an admin); null before migration 0007. */
    createdById: z.uuid().nullable(),
  })
  .meta({ id: 'ProjectSummary' });
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** Settings → Archived: an archived project with its space. */
export const archivedProjectSchema = projectSummarySchema
  .extend({
    archivedAt: z.iso.datetime(),
    space: z.object({
      id: z.uuid(),
      name: z.string(),
      initial: z.string(),
      color: paletteKeySchema,
    }),
  })
  .meta({ id: 'ArchivedProject' });
export type ArchivedProject = z.infer<typeof archivedProjectSchema>;

export const statusSchema = z
  .object({
    id: z.uuid(),
    /** Null = default status; the UI shows the translated name for its category. */
    name: z.string().nullable(),
    category: statusCategorySchema,
    /** Null = the category's color. */
    color: z.string().nullable(),
    position: z.string(),
  })
  .meta({ id: 'Status' });
export type Status = z.infer<typeof statusSchema>;

export const sprintSchema = z
  .object({
    id: z.uuid(),
    /** Per-workspace sequence ("Sprint 14"). */
    number: z.number().int(),
    /** Null = "Sprint {number}", translated. */
    name: z.string().nullable(),
    startDate: dateSchema,
    endDate: dateSchema,
    /** The projects whose tasks can be in the sprint (at least one). */
    projectIds: z.array(z.uuid()),
    /** May edit and delete it, like an admin (null for sprints made before shared sprints). */
    createdBy: z.uuid().nullable(),
  })
  .meta({ id: 'Sprint' });
export type Sprint = z.infer<typeof sprintSchema>;

/** A sprint with how many live (not deleted) tasks are in it: Settings → Sprints. */
export const sprintWithUsageSchema = sprintSchema
  .extend({ taskCount: z.number().int().nonnegative() })
  .meta({ id: 'SprintWithUsage' });
export type SprintWithUsage = z.infer<typeof sprintWithUsageSchema>;

/** `GET /projects/:id` — header, board columns and counts. */
export const projectDetailSchema = projectSummarySchema
  .extend({
    space: z.object({
      id: z.uuid(),
      name: z.string(),
      initial: z.string(),
      color: paletteKeySchema,
    }),
    position: z.string(),
    createdAt: z.iso.datetime(),
    isFavorite: z.boolean(),
    /** Default reviewer for tasks entering review. */
    leadId: z.uuid().nullable(),
    /** The project brief (TipTap JSON), null when nobody wrote one. */
    description: richTextNodeSchema.nullable(),
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
  })
  .meta({ id: 'ProjectDetail' });
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const projectNameSchema = z.string().trim().min(1).max(80);

/** Without `key` the server picks a unique one from the name; `color` defaults by rotation. */
export const createProjectSchema = z
  .object({
    spaceId: z.uuid(),
    name: projectNameSchema,
    key: projectKeySchema.optional(),
    color: paletteKeySchema.optional(),
  })
  .meta({ id: 'CreateProject' });
export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: projectNameSchema,
    key: projectKeySchema,
    color: paletteKeySchema,
    /** A workspace member, or null. */
    leadId: z.uuid().nullable(),
    /** The project brief (TipTap JSON): goal, links, who to ask. */
    description: richTextDocSchema.nullable(),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateProject' });
export type UpdateProject = z.infer<typeof updateProjectSchema>;

/** Reorder within a space, or move to `spaceId` (same workspace). */
export const moveProjectSchema = moveSchema
  .extend({ spaceId: z.uuid().optional() })
  .meta({ id: 'MoveProject' });
export type MoveProject = z.infer<typeof moveProjectSchema>;

export const applyTemplateSchema = z
  .object({ templateId: templateIdSchema })
  .meta({ id: 'ApplyTemplate' });
export type ApplyTemplate = z.infer<typeof applyTemplateSchema>;

export const applyTemplateResponseSchema = z
  .object({
    createdCount: z.number().int(),
    project: projectDetailSchema,
  })
  .meta({ id: 'ApplyTemplateResult' });
export type ApplyTemplateResponse = z.infer<typeof applyTemplateResponseSchema>;

const sprintProjectIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

const sprintDatesInOrder = (s: { startDate?: string; endDate?: string }) =>
  !s.startDate || !s.endDate || s.endDate >= s.startDate;
const DATES_IN_ORDER = {
  message: 'The end date must not be before the start date',
  path: ['endDate'],
};

export const createSprintSchema = z
  .object({
    /** Without a name the sprint shows as "Sprint {number}". */
    name: z.string().trim().min(1).max(80).optional(),
    startDate: dateSchema,
    endDate: dateSchema,
    projectIds: sprintProjectIdsSchema,
  })
  .refine(sprintDatesInOrder, DATES_IN_ORDER)
  .meta({ id: 'CreateSprint' });
export type CreateSprint = z.input<typeof createSprintSchema>;

/** `name: null` goes back to "Sprint {number}". Both dates are checked against the stored ones. */
export const updateSprintSchema = z
  .object({
    name: z.string().trim().min(1).max(80).nullable(),
    startDate: dateSchema,
    endDate: dateSchema,
    projectIds: sprintProjectIdsSchema,
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .refine(sprintDatesInOrder, DATES_IN_ORDER)
  .meta({ id: 'UpdateSprint' });
export type UpdateSprint = z.input<typeof updateSprintSchema>;
