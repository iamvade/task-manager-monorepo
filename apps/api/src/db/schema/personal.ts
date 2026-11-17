import type { PaletteKey, RichTextNode } from '@kite/shared';
import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, position, timestamptz } from './columns.js';
import { personalItemKindEnum } from './enums.js';
import { tasks } from './tasks.js';
import { users } from './users.js';

/**
 * Personal space: one person's private topics, notes and to-dos, the same in every workspace
 * they're in. Only the owner reads or writes these rows (every query filters by `user_id`);
 * nothing here feeds Reports, search, the Inbox, activity or task references.
 */

/** One level of grouping (like a folder). Deleting a topic moves its items to "No topic". */
export const personalTopics = pgTable(
  'personal_topics',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').$type<PaletteKey>().notNull(),
    position: position('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('personal_topics_user_id_lower_name_unique').on(t.userId, sql`lower(${t.name})`),
    index('personal_topics_user_id_position_idx').on(t.userId, t.position),
  ],
);

/** A note or a to-do (a note with a checkbox and a due date). */
export const personalItems = pgTable(
  'personal_items',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: personalItemKindEnum('kind').notNull().default('note'),
    topicId: uuid('topic_id').references(() => personalTopics.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** TipTap document (with `itemLink` / `taskLink` nodes, see `@kite/shared` personal.ts). */
    body: jsonb('body').$type<RichTextNode>(),
    bodyText: text('body_text').notNull().default(''),
    dueDate: date('due_date', { mode: 'string' }),
    doneAt: timestamptz('done_at'),
    position: position('position').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    /** Soft delete (Undo); purged 30 days later. */
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    index('personal_items_user_id_position_idx').on(t.userId, t.position),
    index('personal_items_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
  ],
);

/**
 * The links written in an item's body, rebuilt in the same transaction as every body save.
 * `target_item_id`: a picked item (set null when it's purged, so the row becomes a link to a
 * note by `title` that doesn't exist yet). `target_task_id`: a team task. Neither: a note not
 * created yet, by `title`. Never written into `task_references`.
 */
export const personalLinks = pgTable(
  'personal_links',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceItemId: uuid('source_item_id')
      .notNull()
      .references(() => personalItems.id, { onDelete: 'cascade' }),
    targetItemId: uuid('target_item_id').references(() => personalItems.id, {
      onDelete: 'set null',
    }),
    targetTaskId: uuid('target_task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    /** The title stored in the link (the task's key for task links). */
    title: text('title').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('personal_links_user_id_idx').on(t.userId),
    index('personal_links_source_item_id_idx').on(t.sourceItemId),
    index('personal_links_target_item_id_idx').on(t.targetItemId),
    index('personal_links_target_task_id_idx').on(t.targetTaskId),
    check('personal_links_one_target', sql`${t.targetItemId} is null or ${t.targetTaskId} is null`),
  ],
);
