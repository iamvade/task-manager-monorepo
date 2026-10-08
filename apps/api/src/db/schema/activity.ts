import type { ActivityType } from '@kite/shared';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns.js';
import { notificationTypeEnum } from './enums.js';
import { projects } from './projects.js';
import { tasks } from './tasks.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

/**
 * One row per task mutation, written in the same transaction. `payload` snapshots display data
 * (names, categories) so history survives renames and deletes.
 */
export const activity = pgTable(
  'activity',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type').$type<ActivityType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_task_id_created_at_idx').on(t.taskId, t.createdAt),
    index('activity_workspace_id_created_at_idx').on(t.workspaceId, t.createdAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    activityId: uuid('activity_id').references(() => activity.id, { onDelete: 'cascade' }),
    readAt: timestamptz('read_at'),
    archivedAt: timestamptz('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_id_read_at_idx').on(t.userId, t.readAt),
    index('notifications_activity_id_idx').on(t.activityId),
  ],
);
