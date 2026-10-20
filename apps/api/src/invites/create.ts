import type { WorkspaceRole } from '@kite/shared';
import type { FastifyInstance } from 'fastify';
import { hashToken, newToken } from '../auth/tokens.js';
import type { DbOrTx } from '../db/client.js';
import { one } from '../db/rows.js';
import { invites } from '../db/schema/index.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Inserts an invite and returns it with its accept link. The link is shown once (only the token's
 * hash is stored); in development it is also logged, production logs never carry invite tokens.
 */
export async function insertInvite(
  app: FastifyInstance,
  db: DbOrTx,
  values: { workspaceId: string; email: string; role: WorkspaceRole },
) {
  const token = newToken();
  const invite = one(
    await db
      .insert(invites)
      .values({
        ...values,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning(),
    'invite',
  );
  const link = `${new URL(app.config.WEB_ORIGIN).origin}/invite/${token}`;
  if (app.config.NODE_ENV !== 'production') {
    app.log.info({ email: values.email, link }, 'Invite link');
  }
  return { invite, link };
}
