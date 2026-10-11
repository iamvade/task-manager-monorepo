import { sql } from 'drizzle-orm';
import { index, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamptz } from './columns.js';
import { statusCategoryEnum } from './enums.js';
import { sprints, statuses } from './projects.js';
import { tasks } from './tasks.js';
import { users } from './users.js';

/**
 * How long each task spent in each status. Exactly one open period (`exited_at` null) per task,
 * matching `tasks.status_id`; written only through `tasks/status.ts`, in the same transaction as
 * the status change. A deferred trigger (drizzle/0006) rejects a commit that breaks this.
 */
export const taskStatusPeriods = pgTable(
  'task_status_periods',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    statusId: uuid('status_id').references(() => statuses.id, { onDelete: 'set null' }),
    /** Snapshot, so the period still counts after its status is deleted. */
    category: statusCategoryEnum('category').notNull(),
    enteredAt: timestamptz('entered_at').notNull(),
    exitedAt: timestamptz('exited_at'),
    enteredBy: uuid('entered_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    exitedBy: uuid('exited_by').references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('task_status_periods_task_id_entered_at_idx').on(t.taskId, t.enteredAt),
    index('task_status_periods_status_id_entered_at_idx').on(t.statusId, t.enteredAt),
    index('task_status_periods_category_exited_at_idx').on(t.category, t.exitedAt),
    uniqueIndex('task_status_periods_open_unique')
      .on(t.taskId)
      .where(sql`${t.exitedAt} IS NULL`),
  ],
);

/**
 * When a task was in a sprint. One open row (`removed_at` null) per task, matching
 * `tasks.sprint_id`; written only through `tasks/sprint.ts`. Committed = open at sprint start.
 */
export const sprintMemberships = pgTable(
  'sprint_memberships',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sprintId: uuid('sprint_id')
      .notNull()
      .references(() => sprints.id, { onDelete: 'cascade' }),
    addedAt: timestamptz('added_at').notNull(),
    removedAt: timestamptz('removed_at'),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('sprint_memberships_sprint_id_added_at_idx').on(t.sprintId, t.addedAt),
    index('sprint_memberships_task_id_idx').on(t.taskId),
    uniqueIndex('sprint_memberships_open_unique')
      .on(t.taskId)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);
