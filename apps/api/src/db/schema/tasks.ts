import type { PaletteKey, RichTextNode } from '@kite/shared';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, position, timestamptz } from './columns.js';
import { priorityEnum } from './enums.js';
import { projects, sprints, statuses } from './projects.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Unique per project; shown as `KEY-number`. */
    number: integer('number').notNull(),
    statusId: uuid('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'restrict' }),
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** TipTap document. */
    description: jsonb('description').$type<RichTextNode>(),
    /** Plain text of `description`, for search. */
    descriptionText: text('description_text').notNull().default(''),
    priority: priorityEnum('priority').notNull().default('none'),
    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    position: position('position').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    /** Soft delete. */
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    unique('tasks_project_id_number_unique').on(t.projectId, t.number),
    index('tasks_project_id_status_id_position_idx').on(t.projectId, t.statusId, t.position),
    index('tasks_due_date_idx').on(t.dueDate),
    index('tasks_sprint_id_idx').on(t.sprintId),
    index('tasks_title_trgm_idx').using('gin', t.title.op('gin_trgm_ops')),
  ],
);

export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userId] }),
    index('task_assignees_user_id_idx').on(t.userId),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').$type<PaletteKey>().notNull(),
  },
  (t) => [unique('tags_workspace_id_name_unique').on(t.workspaceId, t.name)],
);

export const taskTags = pgTable(
  'task_tags',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index('task_tags_tag_id_idx').on(t.tagId)],
);

export const subtasks = pgTable(
  'subtasks',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    done: boolean('done').notNull().default(false),
    position: position('position').notNull(),
  },
  (t) => [index('subtasks_task_id_position_idx').on(t.taskId, t.position)],
);

/** Creator, assignees and commenters follow automatically. */
export const taskFollowers = pgTable(
  'task_followers',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userId] }),
    index('task_followers_user_id_idx').on(t.userId),
  ],
);
