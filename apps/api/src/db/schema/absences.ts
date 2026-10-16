import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns.js';
import { users } from './users.js';

/**
 * Out of office, both dates included. General (pickers, @-suggestions, drawer, Workload, the
 * standup strip), edited in Settings by the person and by admins of a workspace they're in.
 */
export const userAbsences = pgTable(
  'user_absences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('user_absences_user_id_end_date_idx').on(t.userId, t.endDate),
    check('user_absences_dates_check', sql`${t.endDate} >= ${t.startDate}`),
  ],
);
