import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { paletteKeySchema, prioritySchema } from '../enums.js';
import { richTextDocSchema, richTextNodeSchema } from '../rich-text.js';
import { NOTHING_TO_UPDATE, moveSchema, nonEmptyPatch, userRefSchema } from './common.js';
import { projectSummarySchema, sprintSchema, statusSchema } from './project.js';
import { tagSchema } from './tag.js';

/**
 * A repeatable query parameter (`?statusId=a&statusId=b`). The server sees a string for one
 * value and an array for several; both parse to an array.
 */
const queryArray = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(item).max(100))
    .optional();

export const TASK_SORTS = ['position', 'dueDate', 'priority', 'createdAt'] as const;
export const taskSortSchema = z.enum(TASK_SORTS);
export type TaskSort = z.infer<typeof taskSortSchema>;

/** `unassigned` in `assigneeId` matches tasks with no assignee. */
export const UNASSIGNED = 'unassigned';

/** Filters and sort of `GET /projects/:id/tasks` (and the space-level list). */
export const taskListQuerySchema = z.object({
  statusId: queryArray(z.uuid()),
  assigneeId: queryArray(z.union([z.uuid(), z.literal(UNASSIGNED)])),
  tagId: queryArray(z.uuid()),
  priority: queryArray(prioritySchema),
  sprintId: z.uuid().optional(),
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
  hasDueDate: z.stringbool().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeDone: z.stringbool().default(true),
  sort: taskSortSchema.default('position'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const spaceTaskListQuerySchema = taskListQuerySchema.extend({
  projectId: queryArray(z.uuid()),
});
export type SpaceTaskListQuery = z.infer<typeof spaceTaskListQuerySchema>;

export const taskProjectRefSchema = z
  .object({
    id: z.uuid(),
    spaceId: z.uuid(),
    key: z.string(),
    name: z.string(),
    color: paletteKeySchema,
  })
  .meta({ id: 'TaskProjectRef' });
export type TaskProjectRef = z.infer<typeof taskProjectRefSchema>;

export const taskStatusRefSchema = statusSchema
  .pick({ id: true, name: true, category: true, color: true })
  .meta({ id: 'TaskStatusRef' });
export type TaskStatusRef = z.infer<typeof taskStatusRefSchema>;

/** A row in List/Board/Calendar. */
export const taskListItemSchema = z
  .object({
    id: z.uuid(),
    /** `APP-142`. */
    key: z.string(),
    number: z.number().int(),
    project: taskProjectRefSchema,
    status: taskStatusRefSchema,
    title: z.string(),
    priority: prioritySchema,
    startDate: dateSchema.nullable(),
    dueDate: dateSchema.nullable(),
    /** Fractional index within the status. */
    position: z.string(),
    sprintId: z.uuid().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    /** By name. */
    assignees: z.array(userRefSchema),
    /** By name. */
    tags: z.array(tagSchema),
    subtaskProgress: z.object({ done: z.number().int(), total: z.number().int() }),
    commentCount: z.number().int(),
    attachmentCount: z.number().int(),
  })
  .meta({ id: 'TaskListItem' });
export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const subtaskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    assignee: userRefSchema.nullable(),
    dueDate: dateSchema.nullable(),
    done: z.boolean(),
    position: z.string(),
  })
  .meta({ id: 'Subtask' });
export type Subtask = z.infer<typeof subtaskSchema>;

export const attachmentSchema = z
  .object({
    id: z.uuid(),
    filename: z.string(),
    mime: z.string(),
    /** Bytes. */
    size: z.number().int(),
    uploader: userRefSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Attachment' });
export type Attachment = z.infer<typeof attachmentSchema>;

/** `GET /tasks/:ref` — everything the drawer shows apart from the activity feed. */
export const taskDetailSchema = taskListItemSchema
  .extend({
    description: richTextNodeSchema.nullable(),
    descriptionText: z.string(),
    sprint: sprintSchema.nullable(),
    creator: userRefSchema,
    /** By position. */
    subtasks: z.array(subtaskSchema),
    /** Oldest first. */
    attachments: z.array(attachmentSchema),
    /** By name. */
    followers: z.array(userRefSchema),
    /** Set when the task is in the trash (restorable). */
    deletedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'TaskDetail' });
export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const taskTitleSchema = z.string().trim().min(1).max(500);
const idList = z.array(z.uuid()).max(50);

/** Defaults: first To Do status, no priority, appended at the end of the status. */
export const createTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: richTextDocSchema.nullable().optional(),
    statusId: z.uuid().optional(),
    priority: prioritySchema.optional(),
    assigneeIds: idList.optional(),
    tagIds: idList.optional(),
    startDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    sprintId: z.uuid().nullable().optional(),
    /** Top or bottom of the status. */
    position: z.enum(['top', 'bottom']).default('bottom'),
  })
  .meta({ id: 'CreateTask' });
export type CreateTask = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: richTextDocSchema.nullable(),
    statusId: z.uuid(),
    priority: prioritySchema,
    startDate: dateSchema.nullable(),
    dueDate: dateSchema.nullable(),
    sprintId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateTask' });
export type UpdateTask = z.input<typeof updateTaskSchema>;

/** Board drag / list reorder: target status plus the neighbors after the move. */
export const moveTaskSchema = moveSchema.extend({ statusId: z.uuid() }).meta({ id: 'MoveTask' });
export type MoveTask = z.input<typeof moveTaskSchema>;

export const setTaskAssigneesSchema = z
  .object({ userIds: idList })
  .meta({ id: 'SetTaskAssignees' });
export type SetTaskAssignees = z.infer<typeof setTaskAssigneesSchema>;

export const setTaskTagsSchema = z.object({ tagIds: idList }).meta({ id: 'SetTaskTags' });
export type SetTaskTags = z.infer<typeof setTaskTagsSchema>;

/** Without `done` the call toggles. */
export const completeTaskSchema = z
  .object({ done: z.boolean().optional() })
  .meta({ id: 'CompleteTask' });
export type CompleteTask = z.infer<typeof completeTaskSchema>;

export const taskRefQuerySchema = z.object({
  /** Narrows a key lookup when the same key exists in several of the caller's workspaces. */
  workspaceId: z.uuid().optional(),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(200) });

export const searchResultSchema = z
  .object({
    tasks: z.array(
      taskListItemSchema.pick({ id: true, key: true, title: true, project: true, status: true }),
    ),
    projects: z.array(projectSummarySchema),
    people: z.array(userRefSchema),
  })
  .meta({ id: 'SearchResult' });
export type SearchResult = z.infer<typeof searchResultSchema>;
