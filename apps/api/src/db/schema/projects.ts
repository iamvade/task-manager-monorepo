import type { PaletteKey, RichTextNode } from '@kite/shared';
import {
  date,
  foreignKey,
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
import { notificationLevelEnum, statusCategoryEnum } from './enums.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const spaces = pgTable(
  'spaces',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    initial: text('initial').notNull(),
    color: text('color').$type<PaletteKey>().notNull(),
    position: position('position').notNull(),
    /** May delete the space while it is empty, like an admin. Null for spaces made before 0007. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    // Target of the composite FK from projects, which keeps projects.workspace_id in sync.
    unique('spaces_id_workspace_id_unique').on(t.id, t.workspaceId),
    index('spaces_workspace_id_position_idx').on(t.workspaceId, t.position),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    /** Denormalized from the space so the key can be unique per workspace. */
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id').notNull(),
    name: text('name').notNull(),
    key: text('key').notNull(),
    color: text('color').$type<PaletteKey>().notNull(),
    /** Last issued task number; tasks take `task_seq + 1`. */
    taskSeq: integer('task_seq').notNull().default(0),
    position: position('position').notNull(),
    /** Default reviewer for tasks entering review. */
    leadId: uuid('lead_id').references(() => users.id, { onDelete: 'set null' }),
    /** The project brief (TipTap JSON) and its plain text. */
    description: jsonb('description').$type<RichTextNode>(),
    descriptionText: text('description_text').notNull().default(''),
    /** May archive / restore the project, like an admin. Null for projects made before 0007. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamptz('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'projects_space_fk',
      columns: [t.spaceId, t.workspaceId],
      foreignColumns: [spaces.id, spaces.workspaceId],
    }).onDelete('cascade'),
    unique('projects_workspace_id_key_unique').on(t.workspaceId, t.key),
    index('projects_space_id_position_idx').on(t.spaceId, t.position),
  ],
);

/** The project's team (avatar stack, suggested assignees/mentions). Not an access boundary. */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_members_user_id_idx').on(t.userId),
  ],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

/** Per-person notification level for a project (Settings → Notifications); no row = `all`. */
export const projectNotificationLevels = pgTable(
  'project_notification_levels',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    level: notificationLevelEnum('level').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

export const statuses = pgTable(
  'statuses',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Null = default status; the UI shows the translated name for its category. */
    name: text('name'),
    category: statusCategoryEnum('category').notNull(),
    /** Null = the category's color. */
    color: text('color'),
    position: position('position').notNull(),
  },
  (t) => [index('statuses_project_id_position_idx').on(t.projectId, t.position)],
);

export const sprints = pgTable(
  'sprints',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Per-project sequence ("Sprint 14"), allocated under the project lock. */
    number: integer('number').notNull(),
    /** Null = "Sprint {number}", translated. */
    name: text('name'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
  },
  (t) => [unique('sprints_project_id_number_unique').on(t.projectId, t.number)],
);
