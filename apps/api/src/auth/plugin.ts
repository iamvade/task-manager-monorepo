import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sessions, users } from '../db/schema/index.js';
import { errorBody, httpError } from '../errors.js';
import {
  SESSION_COOKIE,
  SESSION_REFRESH_MS,
  SESSION_TTL_MS,
  clearSessionCookie,
  sessionExpiry,
  setSessionCookie,
} from './sessions.js';
import { hashToken } from './tokens.js';

export type UserRow = typeof users.$inferSelect;

export interface AuthContext {
  user: UserRow;
  /** Hash of the cookie token (the `sessions.id`). */
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** preHandler: 401 unless the request carries a live session; sets `request.auth`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Looks up the session cookie without failing the request. Pushes the expiry forward (and
 * re-sends the cookie) when the last refresh was more than a day ago.
 */
export async function resolveSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  if (request.auth) return request.auth;
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const { db, config } = request.server;
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) {
    clearSessionCookie(reply, config);
    return null;
  }

  const now = new Date();
  if (row.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: sessionExpiry(now) })
      .where(eq(sessions.id, sessionId));
    setSessionCookie(reply, token, config);
  }

  request.auth = { user: row.user, sessionId };
  return request.auth;
}

/** `request.auth` for handlers behind `authenticate`. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
  return request.auth;
}

/**
 * Session lookup, the `authenticate` preHandler, and the CSRF origin check. Registered on the
 * root instance (not as an encapsulated plugin) so every route context sees the decorators.
 */
export function registerAuth(app: FastifyInstance): void {
  const webOrigin = new URL(app.config.WEB_ORIGIN).origin;

  app.decorateRequest('auth', null);

  // CSRF: browsers always send Origin on cross-site state-changing requests, and SameSite=Lax
  // already keeps the cookie off most of them; this closes the rest.
  app.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (request.headers.origin !== webOrigin) {
      return reply.code(403).send(errorBody('CSRF_REJECTED', 'Request origin not allowed'));
    }
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await resolveSession(request, reply);
    if (!auth) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
  });
}
