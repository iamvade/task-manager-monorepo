import {
  REALTIME_CLOSE_UNAUTHORIZED,
  apiErrorSchema,
  authResultSchema,
  loginRequestSchema,
  meResponseSchema,
  signedInDeviceSchema,
} from '@kite/shared';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LoginThrottle } from '../auth/login-throttle.js';
import { buildMe } from '../auth/me.js';
import { verifyPassword } from '../auth/password.js';
import { requireAuth } from '../auth/plugin.js';
import {
  SESSION_MAX_AGE_MS,
  clearSessionCookie,
  createSession,
  deleteExpiredSessions,
  setSessionCookie,
} from '../auth/sessions.js';
import { sessions, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const errorResponses = { 401: apiErrorSchema, 429: apiErrorSchema };

export const authRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  // Failed attempts per email (+ IP); successes never count.
  const throttle = new LoginThrottle();

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign in',
        description:
          'Sets the `kite_session` cookie. With `client: "mobile"` (native apps) no cookie is set: the body carries `session.token`, sent back as `Authorization: Bearer <token>` (same lifetime as the cookie). `deviceName` labels the session in `GET /auth/sessions`. Throttled by failed attempts only (5 per email and IP, 50 per email, per 15 min; a success clears them): 429 `RATE_LIMITED` with a `Retry-After` header in seconds. Wrong email or password answers 401 `INVALID_CREDENTIALS` either way.',
        security: [],
        body: loginRequestSchema,
        response: { 200: authResultSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { email, password, client, deviceName } = request.body;
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
      const session = await createSession(app.db, user.id, request, { client, deviceName });
      const me = await buildMe(app.db, user);
      if (client === 'mobile') {
        return { ...me, session: { ...session, expiresAt: session.expiresAt.toISOString() } };
      }
      setSessionCookie(reply, session.token, app.config);
      return me;
    },
  );

  app.post(
    '/auth/logout',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Sign out',
        description: 'Deletes the session (cookie or bearer token) and clears the cookie.',
        response: { 204: z.null(), 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { sessionId, via } = requireAuth(request);
      await app.db.delete(sessions).where(eq(sessions.id, sessionId));
      app.realtime.hub.closeSession(sessionId, REALTIME_CLOSE_UNAUTHORIZED);
      if (via === 'cookie') clearSessionCookie(reply, app.config);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/sessions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Signed-in devices',
        description:
          'My live sessions (web and mobile), most recently used first; `current` is the one this request uses. `lastSeenAt` moves at most once a day.',
        response: { 200: z.array(signedInDeviceSchema), 401: apiErrorSchema },
      },
    },
    async (request) => {
      const { user, sessionId } = requireAuth(request);
      const now = new Date();
      const rows = await app.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, user.id),
            gt(sessions.expiresAt, now),
            gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_AGE_MS)),
          ),
        )
        .orderBy(desc(sessions.lastSeenAt), desc(sessions.createdAt));
      return rows.map((row) => ({
        id: row.publicId,
        client: row.client,
        deviceLabel: row.deviceLabel,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: row.id === sessionId,
      }));
    },
  );

  app.delete(
    '/auth/sessions/:sessionId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Sign out a device',
        description:
          'Ends one of my sessions (`id` from `GET /auth/sessions`) and closes its WebSockets (4401). Ending the current one is the same as logout. Someone else’s session answers 404.',
        params: z.object({ sessionId: z.uuid() }),
        response: { 204: z.null(), 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const [deleted] = await app.db
        .delete(sessions)
        .where(
          and(eq(sessions.publicId, request.params.sessionId), eq(sessions.userId, auth.user.id)),
        )
        .returning({ id: sessions.id });
      if (!deleted) throw httpError(404, 'NOT_FOUND', 'Session not found');
      app.realtime.hub.closeSession(deleted.id, REALTIME_CLOSE_UNAUTHORIZED);
      if (deleted.id === auth.sessionId && auth.via === 'cookie') {
        clearSessionCookie(reply, app.config);
      }
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
