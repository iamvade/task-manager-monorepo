import type { SessionClient } from '@kite/shared';
import { and, eq, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { secureCookies, type Config } from '../config.js';
import type { DbOrTx } from '../db/client.js';
import { sessions } from '../db/schema/index.js';
import { parseDevice } from '../feedback/device.js';
import { hashToken, newToken } from './tokens.js';

export const SESSION_COOKIE = 'kite_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A session ends this long after sign-in however active it is (sliding expiry stops there). */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** Sliding expiry is pushed forward at most once per this interval, so reads don't write every time. */
export const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

export const sessionExpiry = (now = new Date()) => new Date(now.getTime() + SESSION_TTL_MS);

export interface NewSession {
  /** The raw token: the cookie value (web) or returned once in the body (mobile). */
  token: string;
  expiresAt: Date;
}

/** What a sign-in request says about itself (`client`, `deviceName` from the login/accept body). */
export interface SessionOrigin {
  client?: SessionClient | undefined;
  deviceName?: string | undefined;
}

const DEVICE_LABEL_MAX = 100;

/** `Chrome on macOS`, `iPhone · iOS 18.1`; the app's own name for itself wins. */
export function deviceLabel(request: FastifyRequest, deviceName?: string): string | null {
  if (deviceName) return deviceName.slice(0, DEVICE_LABEL_MAX);
  const { browser, os, device } = parseDevice(request.headers['user-agent'] ?? '');
  const label = browser && os ? `${browser} on ${os}` : [device, os].filter(Boolean).join(' · ');
  return label ? label.slice(0, DEVICE_LABEL_MAX) : null;
}

/** Creates a session row and returns the raw token. */
export async function createSession(
  db: DbOrTx,
  userId: string,
  request: FastifyRequest,
  origin: SessionOrigin = {},
): Promise<NewSession> {
  const token = newToken();
  const expiresAt = sessionExpiry();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    client: origin.client ?? 'web',
    deviceLabel: deviceLabel(request, origin.deviceName),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function deleteExpiredSessions(db: DbOrTx, userId: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(config),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookies(config),
    sameSite: 'lax',
    path: '/',
  });
}
