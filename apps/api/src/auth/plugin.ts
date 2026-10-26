import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sessions, users } from '../db/schema/index.js';
import { errorBody, httpError } from '../errors.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
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
  /** Hash of the token (the `sessions.id`). */
  sessionId: string;
  /** How the token came: the web app's cookie, or a native app's `Authorization: Bearer`. */
  via: 'cookie' | 'bearer';
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

/** `newToken()` output: 32 bytes, base64url. Anything else can't be a session. */
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/i;

const hasSessionCookie = (request: FastifyRequest) => Boolean(request.cookies[SESSION_COOKIE]);

/** The raw token of `Authorization: Bearer <token>`, if well-formed. Never read from the URL. */
function bearerToken(request: FastifyRequest): string | null {
  return BEARER.exec(request.headers.authorization ?? '')?.[1] ?? null;
}

/**
 * The request's session token. A session cookie wins: a request carrying both is cookie auth
 * (and so needs the web Origin).
 */
function readCredentials(
  request: FastifyRequest,
): { token: string; via: AuthContext['via'] } | null {
  const cookie = request.cookies[SESSION_COOKIE];
  if (cookie) return { token: cookie, via: 'cookie' };
  const bearer = bearerToken(request);
  return bearer ? { token: bearer, via: 'bearer' } : null;
}

/**
 * CSRF: a browser request rides on the ambient cookie, so it must come from the web origin.
 * Native apps send `Authorization: Bearer` (which no other site can attach) and often no Origin.
 * - Origin is the web origin → allowed.
 * - Session cookie present → nothing else is allowed (with or without a bearer header).
 * - No cookie, bearer header → allowed whatever the Origin.
 * - No cookie, no bearer (signing in from the app, the public form) → allowed only without an
 *   Origin: browsers always send one on cross-site requests, so login CSRF stays blocked.
 */
export function originAllowed(request: FastifyRequest, webOrigin: string): boolean {
  const { origin } = request.headers;
  if (origin === webOrigin) return true;
  if (hasSessionCookie(request)) return false;
  return bearerToken(request) !== null || origin === undefined;
}

/**
 * Looks up the session (cookie or bearer token) without failing the request. Pushes the expiry
 * forward (and re-sends the cookie) when the last refresh was more than a day ago, but never past
 * `SESSION_MAX_AGE_MS` after sign-in. A bearer request never gets a cookie set or cleared.
 */
export async function resolveSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  if (request.auth) return request.auth;
  const credentials = readCredentials(request);
  if (!credentials) return null;
  const { token, via } = credentials;

  const { db, config } = request.server;
  const sessionId = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, now),
        gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_AGE_MS)),
      ),
    )
    .limit(1);
  if (!row) {
    if (via === 'cookie') clearSessionCookie(reply, config);
    return null;
  }

  if (row.expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: sessionExpiry(now), lastSeenAt: now })
      .where(eq(sessions.id, sessionId));
    if (via === 'cookie') setSessionCookie(reply, token, config);
  }

  request.auth = { user: row.user, sessionId, via };
  return request.auth;
}

/** `request.auth` for handlers behind `authenticate`. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
  return request.auth;
}

/**
 * Session lookup (cookie or bearer token), the `authenticate` preHandler, and the CSRF origin check. Registered on the
 * root instance (not as an encapsulated plugin) so every route context sees the decorators.
 */
export function registerAuth(app: FastifyInstance): void {
  const webOrigin = new URL(app.config.WEB_ORIGIN).origin;

  app.decorateRequest('auth', null);

  // CSRF: browsers always send Origin on cross-site state-changing requests, and SameSite=Lax
  // already keeps the cookie off most of them; this closes the rest (see `originAllowed`).
  app.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (!originAllowed(request, webOrigin)) {
      return reply.code(403).send(errorBody('CSRF_REJECTED', 'Request origin not allowed'));
    }
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await resolveSession(request, reply);
    if (!auth) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
  });
}
