import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz } from './columns.js';
import { oauthGrants, users } from './users.js';

/**
 * Authorization codes of the remote Claude connector: made when the person clicks Allow, redeemed
 * once at the token endpoint within a minute. Only the hash is stored. A used row is kept for a
 * day so a replay is recognized and ends the sign-in it produced.
 */
export const oauthCodes = pgTable(
  'oauth_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    /** PKCE S256 challenge. */
    codeChallenge: text('code_challenge').notNull(),
    resource: text('resource').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
    /** The sign-in this code became. */
    grantId: uuid('grant_id').references(() => oauthGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('oauth_codes_expires_at_idx').on(t.expiresAt)],
);
