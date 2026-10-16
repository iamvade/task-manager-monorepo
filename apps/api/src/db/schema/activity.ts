import type { ActivityType, StandupDigestData } from '@kite/shared';
import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns.js';
import { notificationTypeEnum } from './enums.js';
import { projects } from './projects.js';
import { standupBlockers, standupEntries, standupGroups, standupReplies } from './standups.js';
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
    index('activity_workspace_id_type_created_at_idx').on(t.workspaceId, t.type, t.createdAt),
    // Standup suggestions: one person's activity in a window.
    index('activity_actor_id_created_at_idx').on(t.actorId, t.createdAt),
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
    /** The task it's about; null for standup notifications (then `standup_group_id` is set). */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    /** Null for the standup reminder and digest. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    activityId: uuid('activity_id').references(() => activity.id, { onDelete: 'cascade' }),
    standupGroupId: uuid('standup_group_id').references(() => standupGroups.id, {
      onDelete: 'cascade',
    }),
    /** The group's standup day. */
    standupDate: date('standup_date', { mode: 'string' }),
    standupEntryId: uuid('standup_entry_id').references(() => standupEntries.id, {
      onDelete: 'cascade',
    }),
    standupBlockerId: uuid('standup_blocker_id').references(() => standupBlockers.id, {
      onDelete: 'cascade',
    }),
    standupReplyId: uuid('standup_reply_id').references(() => standupReplies.id, {
      onDelete: 'cascade',
    }),
    /** The facilitator digest's contents as they were when sent. */
    data: jsonb('data').$type<StandupDigestData>(),
    readAt: timestamptz('read_at'),
    archivedAt: timestamptz('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_id_read_at_idx').on(t.userId, t.readAt),
    // Inbox pages (newest first, keyset).
    index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt, t.id),
    // Collapse lookup in the notifier; also serves the task cascade.
    index('notifications_task_id_user_id_type_idx').on(t.taskId, t.userId, t.type),
    index('notifications_activity_id_idx').on(t.activityId),
    // Collapse lookup for standup notifications; also serves the entry cascade.
    index('notifications_standup_entry_id_user_id_type_idx').on(t.standupEntryId, t.userId, t.type),
    index('notifications_standup_group_id_idx').on(t.standupGroupId),
    check(
      'notifications_subject_check',
      sql`${t.taskId} is not null or ${t.standupGroupId} is not null`,
    ),
  ],
);
