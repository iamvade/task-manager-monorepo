import { and, eq, lt } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { DbOrTx } from '../db/client.js';
import { sessions } from '../db/schema/index.js';
import { hashToken, newToken } from './tokens.js';

export const SESSION_COOKIE = 'kite_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding expiry is pushed forward at most once per this interval, so reads don't write every time. */
export const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

export const sessionExpiry = (now = new Date()) => new Date(now.getTime() + SESSION_TTL_MS);

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(db: DbOrTx, userId: string): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: sessionExpiry() });
  return token;
}

export async function deleteExpiredSessions(db: DbOrTx, userId: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
