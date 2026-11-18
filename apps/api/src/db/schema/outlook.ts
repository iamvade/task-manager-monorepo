import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz } from './columns.js';
import { users } from './users.js';

/**
 * One person's Outlook calendar link (the ICS link Outlook gives when publishing a calendar),
 * the same in every workspace they're in. The link is a capability (anyone holding it reads the
 * calendar): never returned to the web, logged or put in an error. Events aren't stored: the
 * API fetches the link and keeps the text in memory for a few minutes (`outlook/service.ts`).
 */
export const outlookCalendars = pgTable('outlook_calendars', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  /** Last successful fetch. */
  lastSyncedAt: timestamptz('last_synced_at'),
  /** `OutlookError` code of the last failed fetch; null after a success. */
  lastError: text('last_error'),
});
