import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns.js';
import { sessions, users } from './users.js';

/**
 * A browser's Web Push subscription (Settings → Notifications → "Push notifications on this
 * device"). Tied to the session that subscribed, so signing out (or out everywhere, or a
 * password reset) stops that browser's pushes. One row per endpoint: subscribing again from the
 * same browser moves it to the new session and user.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** The push service URL: a capability (anyone holding it can push), never logged. */
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
    /** Last accepted push (or the subscribe), for trimming the oldest. */
    lastUsedAt: timestamptz('last_used_at').notNull().defaultNow(),
  },
  (t) => [
    index('push_subscriptions_user_id_idx').on(t.userId),
    index('push_subscriptions_session_id_idx').on(t.sessionId),
  ],
);
