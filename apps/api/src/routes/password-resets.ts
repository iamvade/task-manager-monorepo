import {
  REALTIME_CLOSE_UNAUTHORIZED,
  apiErrorSchema,
  passwordResetPreviewSchema,
  passwordResetRequestSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { findPendingReset } from '../auth/password-reset.js';
import { passwordResets, sessions, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const tokenParams = z.object({ token: z.string().min(1).max(100) });
const err = apiErrorSchema;

const invalidReset = () =>
  httpError(404, 'RESET_INVALID', 'This reset link is invalid or has expired');

/** The links the platform admin makes (`POST /admin/users/:userId/password-reset`). No account needed. */
export const passwordResetRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/password-resets/:token',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Preview a password reset link',
        description: 'Whose password the link sets. 404 `RESET_INVALID` once used or expired.',
        security: [],
        params: tokenParams,
        response: { 200: passwordResetPreviewSchema, 404: err },
      },
    },
    async (request) => {
      const row = await findPendingReset(app.db, request.params.token);
      if (!row) throw invalidReset();
      return {
        name: row.user.name,
        email: row.user.email,
        expiresAt: row.reset.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    '/password-resets/:token',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Set a new password',
        description:
          'Uses the reset link once: sets the password, signs the person out everywhere (sessions deleted, sockets closed with 4401) and clears their failed sign-in count. Does not sign in. 404 `RESET_INVALID` once used or expired.',
        security: [],
        params: tokenParams,
        body: passwordResetRequestSchema,
        response: { 204: z.null(), 400: err, 404: err },
      },
    },
    async (request, reply) => {
      // Check before hashing, so junk tokens don't cost an argon2 run; rechecked under the lock.
      if (!(await findPendingReset(app.db, request.params.token))) throw invalidReset();
      const passwordHash = await hashPassword(request.body.password);
      const { email, ended } = await app.db.transaction(async (tx) => {
        const row = await findPendingReset(tx, request.params.token, true);
        if (!row) throw invalidReset();
        await tx.update(users).set({ passwordHash }).where(eq(users.id, row.user.id));
        await tx
          .update(passwordResets)
          .set({ usedAt: new Date() })
          .where(eq(passwordResets.id, row.reset.id));
        const deleted = await tx
          .delete(sessions)
          .where(eq(sessions.userId, row.user.id))
          .returning({ id: sessions.id });
        return { email: row.user.email, ended: deleted.map((s) => s.id) };
      });
      for (const id of ended) app.realtime.hub.closeSession(id, REALTIME_CLOSE_UNAUTHORIZED);
      app.loginThrottle.clearAccount(email);
      return reply.code(204).send(null);
    },
  );
  done();
};
