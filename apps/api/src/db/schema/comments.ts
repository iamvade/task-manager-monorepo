import type { RichTextNode } from '@kite/shared';
import { foreignKey, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
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
