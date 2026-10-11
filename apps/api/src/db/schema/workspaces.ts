import { date, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { citext, createdAt, id, timestamptz } from './columns.js';
import { workspaceRoleEnum } from './enums.js';
import { users } from './users.js';

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('member'),
    /** Job title shown as a role hint, e.g. "Eng lead". */
    title: text('title'),
    /** Points this person can take on over the next 2 weeks (Workload capacity marker). */
    capacityPoints: integer('capacity_points').notNull().default(15),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_id_idx').on(t.userId),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    role: workspaceRoleEnum('role').notNull().default('member'),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
  },
  (t) => [index('invites_workspace_id_idx').on(t.workspaceId)],
);

/** Public holidays skipped when counting working days (sprint days, burndown). */
export const workspaceHolidays = pgTable(
  'workspace_holidays',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.date] })],
);
