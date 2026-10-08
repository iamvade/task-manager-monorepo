import type { NotificationPrefs, PaletteKey } from '@kite/shared';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, createdAt, id, timestamptz } from './columns.js';
import { densityEnum, localeEnum, themeEnum } from './enums.js';

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  avatarColor: text('avatar_color').$type<PaletteKey>().notNull(),
  passwordHash: text('password_hash').notNull(),
  locale: localeEnum('locale').notNull().default('mn'),
  timezone: text('timezone').notNull().default('Asia/Ulaanbaatar'),
  theme: themeEnum('theme').notNull().default('system'),
  accent: text('accent').notNull().default('#6E56CF'),
  density: densityEnum('density').notNull().default('comfortable'),
  notificationPrefs: jsonb('notification_prefs')
    .$type<NotificationPrefs>()
    .notNull()
    .default({ mention: true, assigned: true, comment: true, status: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the random session token; the raw token only lives in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);
