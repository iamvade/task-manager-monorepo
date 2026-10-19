import type { FeedbackActivityData, FeedbackDevice } from '@kite/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns.js';
import { feedbackActivityKindEnum, feedbackStatusEnum, feedbackTypeEnum } from './enums.js';
import { tasks } from './tasks.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

/**
 * Customer feedback sent through the public form (`/feedback/:slug`). Submitters have no account:
 * their name, email and phone live here and never reach a task. One feedback links to at most
 * one task; many can link to the same task (duplicates).
 */
export const feedback = pgTable(
  'feedback',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Per workspace, from `workspaces.feedback_seq`; shown as `FB-1042`. */
    number: integer('number').notNull(),
    type: feedbackTypeEnum('type').notNull(),
    status: feedbackStatusEnum('status').notNull().default('new'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    submitterName: text('submitter_name'),
    email: text('email').notNull(),
    phone: text('phone'),
    /** The request's `User-Agent`, as sent. */
    userAgent: text('user_agent').notNull().default(''),
    /** Parsed from the user agent on the server, plus the browser's screen sizes. */
    device: jsonb('device').$type<FeedbackDevice>().notNull(),
    /** Set null when the task row goes (a soft delete unlinks in `feedback/link.ts`). */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /** Email the submitter when the linked task is done (no email service yet: see notify-on-done). */
    notifyOnDone: boolean('notify_on_done').notNull().default(false),
    /** Someone on the team opened it (shared by the team, not per person). */
    isRead: boolean('is_read').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('feedback_workspace_id_number_unique').on(t.workspaceId, t.number),
    index('feedback_workspace_id_status_idx').on(t.workspaceId, t.status),
    index('feedback_workspace_id_type_idx').on(t.workspaceId, t.type),
    index('feedback_workspace_id_created_at_idx').on(t.workspaceId, t.createdAt.desc()),
    index('feedback_task_id_idx').on(t.taskId),
    // Similar reports at submit time and "Similar tasks" use trigram similarity on the title.
    index('feedback_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    check('feedback_title_length_check', sql`char_length(${t.title}) <= 120`),
  ],
);

/**
 * Files sent with the public form. Uploaded one by one before the form is sent (per-file
 * progress), so a row starts unclaimed (`feedback_id` null) and is claimed by the submit that
 * presents its token; unclaimed rows older than a day are removed with their files.
 */
export const feedbackAttachments = pgTable(
  'feedback_attachments',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    feedbackId: uuid('feedback_id').references(() => feedback.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token returned by the upload. */
    uploadTokenHash: text('upload_token_hash').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('feedback_attachments_feedback_id_idx').on(t.feedbackId),
    index('feedback_attachments_unclaimed_idx')
      .on(t.createdAt)
      .where(sql`${t.feedbackId} is null`),
    index('feedback_attachments_workspace_id_idx').on(t.workspaceId),
  ],
);

/** "Internal notes & activity" of a feedback item: team only, never shown to the submitter. */
export const feedbackActivity = pgTable(
  'feedback_activity',
  {
    id: id(),
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedback.id, { onDelete: 'cascade' }),
    /** Null for the submitter (`created`) and system rows (`similar_found`). */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: feedbackActivityKindEnum('kind').notNull(),
    /** A note's text. */
    text: text('text'),
    data: jsonb('data').$type<FeedbackActivityData>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('feedback_activity_feedback_id_created_at_idx').on(t.feedbackId, t.createdAt)],
);
