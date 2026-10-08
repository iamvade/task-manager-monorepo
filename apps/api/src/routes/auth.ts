import {
  apiErrorSchema,
  loginRequestSchema,
  meResponseSchema,
  type LoginRequest,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { buildMe } from '../auth/me.js';
import { verifyPassword } from '../auth/password.js';
import { requireAuth } from '../auth/plugin.js';
import {
  clearSessionCookie,
  createSession,
  deleteExpiredSessions,
  setSessionCookie,
} from '../auth/sessions.js';
import { sessions, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const errorResponses = { 401: apiErrorSchema, 429: apiErrorSchema };

export const authRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  // Per-email limit on top of the per-IP route limit, so one account can't be brute-forced from many IPs.
  const emailLimit = app.createRateLimit({
    max: 5,
    timeWindow: '15 minutes',
    keyGenerator: (request) => `login:${(request.body as LoginRequest).email}`,
  });

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in',
        description:
          'Sets the `kite_session` cookie. Rate-limited per IP and per email; wrong email or password answers 401 `INVALID_CREDENTIALS` either way.',
        security: [],
        body: loginRequestSchema,
        response: { 200: meResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      // `isAllowed` only means "skipped (allow list)"; `isExceeded` is the actual verdict.
      const limit = await emailLimit(request);
      if (!limit.isAllowed && limit.isExceeded) {
        reply.header('retry-after', limit.ttlInSeconds);
        throw httpError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
      }

      const { email, password } = request.body;
      const [user] = await app.db.select().from(users).where(eq(users.email, email)).limit(1);
      const ok = await verifyPassword(user?.passwordHash, password);
      if (!user || !ok) {
        throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }

      await deleteExpiredSessions(app.db, user.id);
      const token = await createSession(app.db, user.id);
      setSessionCookie(reply, token, app.config);
      return buildMe(app.db, user);
    },
  );

  app.post(
    '/auth/logout',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Sign out',
        description: 'Deletes the session and clears the cookie.',
        response: { 204: z.null(), 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { sessionId } = requireAuth(request);
      await app.db.delete(sessions).where(eq(sessions.id, sessionId));
      clearSessionCookie(reply, app.config);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Current user',
        description: 'User, preferences and workspace memberships.',
        response: { 200: meResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request) => buildMe(app.db, requireAuth(request).user),
  );
  done();
};
