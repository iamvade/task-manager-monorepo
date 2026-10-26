import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import { one } from '../db/rows.js';
import { passwordResets, users } from '../db/schema/index.js';
import { hashToken, newToken } from './tokens.js';

export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Makes a password reset link for the user, replacing their earlier unused ones. The link is shown
 * once (only the token's hash is stored); in development it is also logged, like invite links.
 */
export async function issuePasswordReset(
  app: FastifyInstance,
  db: DbOrTx,
  user: { id: string; email: string },
  createdBy: string,
) {
  await db
    .delete(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
  const token = newToken();
  const reset = one(
    await db
      .insert(passwordResets)
      .values({
        userId: user.id,
        tokenHash: hashToken(token),
        createdBy,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      })
      .returning(),
    'password reset',
  );
  const link = `${new URL(app.config.WEB_ORIGIN).origin}/reset-password/${token}`;
  if (app.config.NODE_ENV !== 'production') {
    app.log.info({ email: user.email, link }, 'Password reset link');
  }
  return { email: user.email, expiresAt: reset.expiresAt.toISOString(), link };
}

/** An unused, unexpired reset link by raw token with its user, optionally row-locked. */
export async function findPendingReset(db: DbOrTx, token: string, lock = false) {
  const query = db
    .select({
      reset: passwordResets,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
        // The platform admin resets with the CLI; a link for them is never valid.
        isNull(users.platformRole),
      ),
    )
    .limit(1);
  const [row] = await (lock ? query.for('update', { of: passwordResets }) : query);
  return row;
}
