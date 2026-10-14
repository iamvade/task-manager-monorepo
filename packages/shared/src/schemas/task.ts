import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { paletteKeySchema, prioritySchema, sizeSchema, statusCategorySchema } from '../enums.js';
import { richTextDocSchema, richTextNodeSchema } from '../rich-text.js';
import { NOTHING_TO_UPDATE, moveSchema, nonEmptyPatch, userRefSchema } from './common.js';
import { projectSummarySchema, sprintSchema, statusSchema } from './project.js';
import { subtaskSchema } from './subtask.js';
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
  /** Status category; the space-level list filters by it since statuses are per project. */
  statusCategory: queryArray(statusCategorySchema),
  assigneeId: queryArray(z.union([z.uuid(), z.literal(UNASSIGNED)])),
  /** Who created the task ("Created by me"). */
  createdBy: queryArray(z.uuid()),
  tagId: queryArray(z.uuid()),
  priority: queryArray(prioritySchema),
  sprintId: z.uuid().optional(),
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
  hasDueDate: z.stringbool().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  includeDone: z.stringbool().default(true),
  /**
   * Keep only done tasks completed on or after this date (caller's time zone); open tasks are
   * unaffected. List and Board send today − 13 days so a big project doesn't ship years of Done.
   */
  doneSince: dateSchema.optional(),
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
    /** Story points via SIZE_POINTS; null = unsized. */
    size: sizeSchema.nullable(),
    startDate: dateSchema.nullable(),
    dueDate: dateSchema.nullable(),
    /** Fractional index within the status. */
    position: z.string(),
    sprintId: z.uuid().nullable(),
    /** Set when the task enters review (the picked person, else the project lead). */
    reviewerId: z.uuid().nullable(),
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
    reviewer: userRefSchema.nullable(),
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
    size: sizeSchema.nullable().optional(),
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
    size: sizeSchema.nullable(),
    startDate: dateSchema.nullable(),
    dueDate: dateSchema.nullable(),
    sprintId: z.uuid().nullable(),
    /**
     * A workspace member, or null. Sent with a `statusId` that enters review, it is the reviewer
     * picked for the move (the project lead otherwise); on its own it replaces the reviewer.
     */
    reviewerId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .meta({ id: 'UpdateTask' });
export type UpdateTask = z.input<typeof updateTaskSchema>;

/** Most tasks one batch request may change (List multi-select). */
export const MAX_BATCH_TASKS = 200;

/** One task's new values in a batch; the client sends exact per-task values (also for Undo). */
export const batchTaskUpdateSchema = z
  .object({
    id: z.uuid(),
    statusId: z.uuid().optional(),
    sprintId: z.uuid().nullable().optional(),
    assigneeIds: z.array(z.uuid()).max(50).optional(),
    dueDate: dateSchema.nullable().optional(),
    priority: prioritySchema.optional(),
  })
  .strict()
  .meta({ id: 'BatchTaskUpdate' });
export type BatchTaskUpdate = z.infer<typeof batchTaskUpdateSchema>;

const distinctIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

export const batchUpdateTasksSchema = z
  .object({ updates: z.array(batchTaskUpdateSchema).min(1).max(MAX_BATCH_TASKS) })
  .refine((b) => distinctIds(b.updates.map((u) => u.id)), 'Each task may appear once')
  .meta({ id: 'BatchUpdateTasks' });
export type BatchUpdateTasks = z.infer<typeof batchUpdateTasksSchema>;

export const batchTaskIdsSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(MAX_BATCH_TASKS) })
  .refine((b) => distinctIds(b.ids), 'Each task may appear once')
  .meta({ id: 'BatchTaskIds' });
export type BatchTaskIds = z.infer<typeof batchTaskIdsSchema>;

/** Board drag / list reorder: target status plus the neighbors after the move. */
export const moveTaskSchema = moveSchema.extend({ statusId: z.uuid() }).meta({ id: 'MoveTask' });
export type MoveTask = z.input<typeof moveTaskSchema>;

export const setTaskAssigneesSchema = z
  .object({ userIds: idList })
  .meta({ id: 'SetTaskAssignees' });
export type SetTaskAssignees = z.infer<typeof setTaskAssigneesSchema>;

export const setTaskTagsSchema = z.object({ tagIds: idList }).meta({ id: 'SetTaskTags' });
export type SetTaskTags = z.infer<typeof setTaskTagsSchema>;

/** Copy of a task in the same project; `title` defaults to the original's (the client localizes "(copy)"). */
export const duplicateTaskSchema = z
  .object({ title: taskTitleSchema.optional() })
  .meta({ id: 'DuplicateTask' });
export type DuplicateTask = z.infer<typeof duplicateTaskSchema>;

/** Moves a task to another project of the same workspace (new key there). */
export const moveTaskToProjectSchema = z
  .object({ projectId: z.uuid() })
  .meta({ id: 'MoveTaskToProject' });
export type MoveTaskToProject = z.infer<typeof moveTaskToProjectSchema>;

/** Without `done` the call toggles. */
export const completeTaskSchema = z
  .object({ done: z.boolean().optional() })
  .meta({ id: 'CompleteTask' });
export type CompleteTask = z.infer<typeof completeTaskSchema>;

export const taskRefQuerySchema = z.object({
  /** Narrows a key lookup when the same key exists in several of the caller's workspaces. */
  workspaceId: z.uuid().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  /** "Show more tasks": skip this many task results (then only tasks come back). */
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

/** A ⌘K comment hit: the comment, its task and the text around the match. */
export const searchCommentSchema = z
  .object({
    id: z.uuid(),
    task: z.object({
      id: z.uuid(),
      key: z.string(),
      title: z.string(),
      status: taskStatusRefSchema,
    }),
    author: userRefSchema,
    /** Up to ~120 characters of the comment around the match. */
    snippet: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'SearchComment' });
export type SearchComment = z.infer<typeof searchCommentSchema>;

export const searchResultSchema = z
  .object({
    tasks: z.array(
      taskListItemSchema.pick({
        id: true,
        key: true,
        title: true,
        project: true,
        status: true,
        assignees: true,
        dueDate: true,
      }),
    ),
    projects: z.array(projectSummarySchema),
    people: z.array(userRefSchema),
    /** Comments whose text matches (first page only), newest first. */
    comments: z.array(searchCommentSchema),
    /** Pass as `offset` for more tasks; null when there are no more. */
    nextTaskOffset: z.number().int().nullable(),
  })
  .meta({ id: 'SearchResult' });
export type SearchResult = z.infer<typeof searchResultSchema>;
