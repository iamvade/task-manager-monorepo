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

/**
 * A remote Claude connector sign-in (OAuth): what Settings → Claude lists and revokes. It owns
 * the refresh token (hash only); each refresh rotates it and adds a one-hour access token, a
 * `sessions` row with `client: 'connector'` pointing here. Deleting the grant ends them all.
 */
export const oauthGrants = pgTable(
  'oauth_grants',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The allow-listed client (Claude's published identity URL). */
    clientId: text('client_id').notNull(),
    /** Its name when the person agreed, for the Settings list. */
    clientName: text('client_name').notNull(),
    /** The connector address the tokens are for (RFC 8707 audience). */
    resource: text('resource').notNull(),
    refreshHash: text('refresh_hash').notNull().unique(),
    /**
     * The refresh token before the last rotation: seen again within the grace window it is only
     * refused (two refreshes raced); later it means the token leaked, and the grant is deleted.
     */
    prevRefreshHash: text('prev_refresh_hash'),
    rotatedAt: timestamptz('rotated_at'),
    createdAt: createdAt(),
    lastUsedAt: timestamptz('last_used_at').notNull().defaultNow(),
    /** 30 days after the last refresh. */
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    index('oauth_grants_user_id_idx').on(t.userId),
    index('oauth_grants_prev_refresh_hash_idx').on(t.prevRefreshHash),
  ],
);

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
    /** Set for `connector` sessions: the sign-in this access token belongs to. */
    grantId: uuid('grant_id').references(() => oauthGrants.id, { onDelete: 'cascade' }),
    /** `Chrome on macOS`, or the name a native app sent. */
    deviceLabel: text('device_label'),
    expiresAt: timestamptz('expires_at').notNull(),
    /** Bumped with the sliding expiry (at most once a day). */
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId), index('sessions_grant_id_idx').on(t.grantId)],
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
