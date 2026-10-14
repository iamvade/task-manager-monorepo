import type { RichTextNode } from '@kite/shared';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns.js';
import { tasks } from './tasks.js';
import { users } from './users.js';

export const comments = pgTable(
  'comments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Set on replies. */
    parentId: uuid('parent_id'),
    body: jsonb('body').$type<RichTextNode>().notNull(),
    bodyText: text('body_text').notNull().default(''),
    createdAt: createdAt(),
    editedAt: timestamptz('edited_at'),
    /** Soft delete. */
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    foreignKey({
      name: 'comments_parent_fk',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('cascade'),
    index('comments_task_id_created_at_idx').on(t.taskId, t.createdAt),
    index('comments_parent_id_idx').on(t.parentId),
    index('comments_author_id_created_at_idx').on(t.authorId, t.createdAt),
    // ⌘K comment search (ILIKE '%…%').
    index('comments_body_text_trgm_idx').using('gin', t.bodyText.op('gin_trgm_ops')),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    /** Bytes. */
    size: integer('size').notNull(),
    /** Key inside the `Storage` backend. */
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_task_id_idx').on(t.taskId)],
);

/**
 * `KEY-123` mentioned in a task's title/description (`comment_id` null) or in one of its
 * comments: the target's "Mentioned in". Kept in sync on every write (tasks/references.ts).
 */
export const taskReferences = pgTable(
  'task_references',
  {
    id: id(),
    sourceTaskId: uuid('source_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    targetTaskId: uuid('target_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('task_references_source_target_comment_unique')
      .on(t.sourceTaskId, t.targetTaskId, t.commentId)
      .nullsNotDistinct(),
    index('task_references_target_task_id_idx').on(t.targetTaskId),
  ],
);
