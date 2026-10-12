import {
  REALTIME_CLOSE_UNAUTHORIZED,
  apiErrorSchema,
  loginRequestSchema,
  meResponseSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LoginThrottle } from '../auth/login-throttle.js';
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
  // Failed attempts per email (+ IP), on top of the per-IP route limit.
  const throttle = new LoginThrottle();

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in',
        description:
          'Sets the `kite_session` cookie. Rate-limited per IP (10/min) and by failed attempts (5 per email and IP, 50 per email, per 15 min; a success clears them): 429 `RATE_LIMITED`. Wrong email or password answers 401 `INVALID_CREDENTIALS` either way.',
        security: [],
        body: loginRequestSchema,
        response: { 200: meResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const wait = throttle.retryAfter(email, request.ip);
      if (wait > 0) {
        reply.header('retry-after', wait);
        throw httpError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
      }

      const [user] = await app.db.select().from(users).where(eq(users.email, email)).limit(1);
      const ok = await verifyPassword(user?.passwordHash, password);
      if (!user || !ok) {
        throttle.fail(email, request.ip);
        throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }
      throttle.succeed(email, request.ip);

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
      app.realtime.hub.closeSession(sessionId, REALTIME_CLOSE_UNAUTHORIZED);
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
