import type { NotificationPrefs, PaletteKey } from '@kite/shared';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, createdAt, id, timestamptz } from './columns.js';
import { uuidv7 } from 'uuidv7';
import {
  densityEnum,
  localeEnum,
  platformRoleEnum,
  sessionClientEnum,
  themeEnum,
} from './enums.js';

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  avatarColor: text('avatar_color').$type<PaletteKey>().notNull(),
  passwordHash: text('password_hash').notNull(),
  /** `vade` = the platform admin: creates workspaces, never a member of one. Null = normal user. */
  platformRole: platformRoleEnum('platform_role'),
  locale: localeEnum('locale').notNull().default('mn'),
  timezone: text('timezone').notNull().default('Asia/Ulaanbaatar'),
  theme: themeEnum('theme').notNull().default('system'),
  accent: text('accent').notNull().default('#6E56CF'),
  density: densityEnum('density').notNull().default('comfortable'),
  notificationPrefs: jsonb('notification_prefs')
    .$type<NotificationPrefs>()
    .notNull()
    .default({ mention: true, assigned: true, comment: true, status: true, standups: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /**
     * SHA-256 of the random session token; the raw token only lives in the cookie (web) or the
     * app's secure storage (sent as `Authorization: Bearer`).
     */
    id: text('id').primaryKey(),
    /** What the signed-in devices list shows and revokes by, so the hash never leaves the server. */
    publicId: uuid('public_id')
      .notNull()
      .unique()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    client: sessionClientEnum('client').notNull().default('web'),
    /** `Chrome on macOS`, or the name a native app sent. */
    deviceLabel: text('device_label'),
    expiresAt: timestamptz('expires_at').notNull(),
    /** Bumped with the sliding expiry (at most once a day). */
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

/**
 * One-time links the platform admin makes so someone who forgot their password can set a new
 * one (there is no email delivery). Only the token's hash is stored; one unused link per person.
 */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('password_resets_user_id_idx').on(t.userId)],
);
