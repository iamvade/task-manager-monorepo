import { apiErrorSchema, meResponseSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../src/auth/sessions.js';
import { hashToken } from '../src/auth/tokens.js';
import { one } from '../src/db/rows.js';
import { sessions } from '../src/db/schema/index.js';
import {
  ORIGIN,
  PASSWORD,
  createUser,
  createWorkspace,
  login,
  randomIp,
  sessionCookie,
  errorCode,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('auth', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const postLogin = (email: string, password: string, ip = randomIp()) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      remoteAddress: ip,
      payload: { email, password },
    });

  const me = (cookie?: string) =>
    ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: cookie ? { cookie } : {},
    });

  const tokenFrom = (cookie: string) => cookie.slice(SESSION_COOKIE.length + 1);

  describe('POST /auth/login', () => {
    it('signs in, sets a secure session cookie and stores only its hash', async () => {
      const user = await createUser(ctx.db, { name: 'Anu Bold' });
      const ws = await createWorkspace(ctx.db, user.id);

      const res = await postLogin(user.email.toUpperCase(), PASSWORD);
      expect(res.statusCode).toBe(200);
      const body = meResponseSchema.parse(res.json());
      expect(body.user).toMatchObject({ id: user.id, email: user.email, name: 'Anu Bold' });
      expect(body.workspaces).toEqual([
        { id: ws.id, name: ws.name, slug: ws.slug, role: 'owner', title: null },
      ]);
      expect(body.preferences).toMatchObject({ locale: 'mn', timezone: 'Asia/Ulaanbaatar' });

      const cookie = sessionCookie(res);
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
      expect(cookie?.secure).toBeFalsy(); // Secure only in production
      expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const stored = await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(stored).toHaveLength(1);
      expect(stored.map((row) => row.id)).toEqual([hashToken(cookie?.value ?? '')]);
    });

    it('gives the same generic error for a wrong password and an unknown email', async () => {
      const user = await createUser(ctx.db);
      const wrong = await postLogin(user.email, 'not the password');
      const unknown = await postLogin('nobody-here@kite.test', PASSWORD);

      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(apiErrorSchema.parse(wrong.json())).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      expect(unknown.json()).toEqual(wrong.json());
      expect(sessionCookie(wrong)).toBeUndefined();
    });

    it('rejects a malformed body', async () => {
      const res = await postLogin('not-an-email', '');
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_ERROR');
    });

    it('limits attempts per email across IPs', async () => {
      const user = await createUser(ctx.db);
      for (let i = 0; i < 5; i++) {
        expect((await postLogin(user.email, 'wrong')).statusCode).toBe(401);
      }
      const blocked = await postLogin(user.email, PASSWORD);
      expect(blocked.statusCode).toBe(429);
      expect(errorCode(blocked)).toBe('RATE_LIMITED');
    });

    it('limits attempts per IP across emails', async () => {
      const ip = randomIp();
      for (let i = 0; i < 10; i++) {
        expect((await postLogin(`ip-${i}@kite.test`, 'wrong', ip)).statusCode).toBe(401);
      }
      expect((await postLogin('ip-last@kite.test', 'wrong', ip)).statusCode).toBe(429);
    });
  });

  describe('sessions', () => {
    it('GET /auth/me needs a session', async () => {
      const res = await me();
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
      expect((await me(`${SESSION_COOKIE}=garbage`)).statusCode).toBe(401);
    });

    it('rejects an expired session', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      expect((await me(cookie)).statusCode).toBe(200);

      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, hashToken(tokenFrom(cookie))));

      const res = await me(cookie);
      expect(res.statusCode).toBe(401);
      expect(sessionCookie(res)?.value).toBe(''); // cookie cleared
    });

    it('slides the expiry forward on use, at most once a day', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      const id = hashToken(tokenFrom(cookie));
      const expiresAt = async () =>
        one(await ctx.db.select().from(sessions).where(eq(sessions.id, id))).expiresAt.getTime();

      // Fresh session: no refresh, no new cookie.
      const before = await expiresAt();
      const fresh = await me(cookie);
      expect(sessionCookie(fresh)).toBeUndefined();
      expect(await expiresAt()).toBe(before);

      // Five days from expiry: pushed back to ~30 days, cookie re-sent.
      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + 5 * DAY) })
        .where(eq(sessions.id, id));
      const res = await me(cookie);
      expect(res.statusCode).toBe(200);
      expect(sessionCookie(res)?.value).toBe(tokenFrom(cookie));
      expect(await expiresAt()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    });

    it('logout deletes the session', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: ORIGIN, cookie },
      });
      expect(res.statusCode).toBe(204);
      expect(sessionCookie(res)?.value).toBe('');
      expect((await me(cookie)).statusCode).toBe(401);
    });
  });

  describe('CSRF', () => {
    it('rejects state-changing requests without the web origin', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      for (const headers of [{ cookie }, { cookie, origin: 'https://evil.example' }]) {
        const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
      // Session still alive.
      expect((await me(cookie)).statusCode).toBe(200);
    });
  });
});
