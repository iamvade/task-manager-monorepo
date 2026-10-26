import { authResultSchema, createdInviteSchema, signedInDeviceSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../src/auth/sessions.js';
import { hashToken } from '../src/auth/tokens.js';
import { one } from '../src/db/rows.js';
import { sessions } from '../src/db/schema/index.js';
import {
  ORIGIN,
  PASSWORD,
  bearer,
  createUser,
  createWorkspace,
  errorCode,
  login,
  loginMobile,
  randomIp,
} from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

const DAY = 24 * 60 * 60 * 1000;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

describe('native-client (bearer) auth', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const inject = (method: InjectOptions['method'], url: string, opts: InjectOptions = {}) =>
    ctx.app.inject({ ...opts, method, url: `/api/v1${url}` });

  const me = (headers: Record<string, string>) => inject('GET', '/auth/me', { headers });

  const sessionRow = async (token: string) =>
    one(
      await ctx.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken(token))),
    );

  describe('POST /auth/login with client: mobile', () => {
    it('returns the token in the body, sets no cookie and stores only its hash', async () => {
      const user = await createUser(ctx.db);
      const res = await inject('POST', '/auth/login', {
        remoteAddress: randomIp(),
        headers: { 'user-agent': IPHONE_UA },
        payload: {
          email: user.email,
          password: PASSWORD,
          client: 'mobile',
          deviceName: 'Anu’s iPhone',
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      const body = authResultSchema.parse(res.json());
      expect(body.user.id).toBe(user.id);
      const token = body.session?.token;
      if (!token) throw new Error('expected a session token');
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(body.session?.expiresAt ?? 0).getTime()).toBeGreaterThan(
        Date.now() + SESSION_TTL_MS - 60_000,
      );

      const row = await sessionRow(token);
      expect(row).toMatchObject({ userId: user.id, client: 'mobile', deviceLabel: 'Anu’s iPhone' });
      expect(row.id).not.toBe(token);
    });

    it('labels the session from the user agent when the app sends no name', async () => {
      const user = await createUser(ctx.db);
      const res = await inject('POST', '/auth/login', {
        remoteAddress: randomIp(),
        headers: { 'user-agent': IPHONE_UA },
        payload: { email: user.email, password: PASSWORD, client: 'mobile' },
      });
      const token = authResultSchema.parse(res.json()).session?.token ?? '';
      expect((await sessionRow(token)).deviceLabel).toBe('iPhone · iOS 18.1');
    });

    it('keeps the web login as it was: cookie, no token in the body, client web', async () => {
      const user = await createUser(ctx.db);
      const res = await inject('POST', '/auth/login', {
        remoteAddress: randomIp(),
        headers: { origin: ORIGIN },
        payload: { email: user.email, password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).not.toHaveProperty('session');
      const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
      expect((await sessionRow(cookie?.value ?? '')).client).toBe('web');
    });

    it('is throttled like the web login', async () => {
      const user = await createUser(ctx.db);
      const ip = randomIp();
      const attempt = (password: string) =>
        inject('POST', '/auth/login', {
          remoteAddress: ip,
          payload: { email: user.email, password, client: 'mobile' },
        });
      for (let i = 0; i < 5; i++) expect((await attempt('wrong')).statusCode).toBe(401);
      const blocked = await attempt(PASSWORD);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('refuses a sign-in posted from another site', async () => {
      const user = await createUser(ctx.db);
      for (const client of [undefined, 'mobile']) {
        const res = await inject('POST', '/auth/login', {
          remoteAddress: randomIp(),
          headers: { origin: 'https://evil.example' },
          payload: { email: user.email, password: PASSWORD, ...(client ? { client } : {}) },
        });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
    });
  });

  describe('Authorization: Bearer', () => {
    it('works on protected routes, and mutations need no Origin', async () => {
      const w = await taskWorld(ctx);
      const token = await loginMobile(ctx.app, w.owner.email);

      expect((await me(bearer(token))).statusCode).toBe(200);
      const sidebar = await inject('GET', `/workspaces/${w.ws.id}/sidebar`, {
        headers: bearer(token),
      });
      expect(sidebar.statusCode, sidebar.body).toBe(200);

      for (const origin of [undefined, 'https://evil.example', ORIGIN]) {
        const res = await inject('PATCH', '/me', {
          headers: { ...bearer(token), ...(origin ? { origin } : {}) },
          payload: { name: 'Anu Bold' },
        });
        expect(res.statusCode, `origin=${origin}`).toBe(200);
      }
      const created = await inject('POST', `/projects/${w.project.id}/tasks`, {
        headers: bearer(token),
        payload: { title: 'From the phone' },
      });
      expect(created.statusCode, created.body).toBe(201);
    });

    it('is cookie auth when the cookie comes too: Origin required', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      const token = await loginMobile(ctx.app, user.email);
      for (const headers of [{ cookie }, { cookie, ...bearer(token) }]) {
        const res = await inject('PATCH', '/me', { headers, payload: { name: 'X Y' } });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
      // A dead cookie isn't skipped in favour of the bearer token.
      const both = await me({ cookie: `${SESSION_COOKIE}=garbage`, ...bearer(token) });
      expect(both.statusCode).toBe(401);
    });

    it('never sets or clears a cookie, and slides the expiry like the cookie does', async () => {
      const user = await createUser(ctx.db);
      const token = await loginMobile(ctx.app, user.email);
      const id = hashToken(token);
      await ctx.db
        .update(sessions)
        .set({
          expiresAt: new Date(Date.now() + 5 * DAY),
          lastSeenAt: new Date(Date.now() - 25 * DAY),
        })
        .where(eq(sessions.id, id));

      const res = await me(bearer(token));
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      const row = await sessionRow(token);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
      expect(row.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, id));
      const expired = await me(bearer(token));
      expect(expired.statusCode).toBe(401);
      expect(expired.headers['set-cookie']).toBeUndefined();
    });

    it('rejects expired, too old, logged-out and malformed tokens', async () => {
      const user = await createUser(ctx.db);

      const expired = await loginMobile(ctx.app, user.email);
      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, hashToken(expired)));
      expect((await me(bearer(expired))).statusCode).toBe(401);

      const old = await loginMobile(ctx.app, user.email);
      await ctx.db
        .update(sessions)
        .set({ createdAt: new Date(Date.now() - 91 * DAY), expiresAt: new Date(Date.now() + DAY) })
        .where(eq(sessions.id, hashToken(old)));
      expect((await me(bearer(old))).statusCode).toBe(401);

      const live = await loginMobile(ctx.app, user.email);
      const logout = await inject('POST', '/auth/logout', { headers: bearer(live) });
      expect(logout.statusCode).toBe(204);
      expect(logout.headers['set-cookie']).toBeUndefined();
      const after = await me(bearer(live));
      expect(after.statusCode).toBe(401);
      expect(errorCode(after)).toBe('UNAUTHORIZED');

      const other = await loginMobile(ctx.app, user.email);
      for (const authorization of [
        `Basic ${other}`,
        `Bearer ${other}x`,
        `Bearer  ${other}`,
        other,
        'Bearer garbage',
      ]) {
        expect((await me({ authorization })).statusCode, authorization).toBe(401);
      }
      expect((await me({ authorization: `bearer ${other}` })).statusCode).toBe(200);
    });

    it('never reads the token from the query string', async () => {
      const user = await createUser(ctx.db);
      const token = await loginMobile(ctx.app, user.email);
      for (const name of ['token', 'access_token', 'session']) {
        expect((await inject('GET', `/auth/me?${name}=${token}`)).statusCode).toBe(401);
      }
    });

    it('keeps 404 for a workspace the caller is not in', async () => {
      const w = await taskWorld(ctx);
      const outsider = await createUser(ctx.db);
      await createWorkspace(ctx.db, outsider.id);
      const token = await loginMobile(ctx.app, outsider.email);
      for (const [method, url] of [
        ['GET', `/workspaces/${w.ws.id}/sidebar`],
        ['GET', `/projects/${w.project.id}`],
        ['PATCH', `/projects/${w.project.id}`],
      ] as const) {
        const res = await inject(method, url, {
          headers: bearer(token),
          ...(method === 'PATCH' ? { payload: { name: 'Mine now' } } : {}),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(errorCode(res)).toBe('NOT_FOUND');
      }
    });
  });

  describe('cookie CSRF is unchanged', () => {
    it('rejects a cookie POST without the web Origin', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      for (const headers of [{ cookie }, { cookie, origin: 'https://evil.example' }]) {
        const res = await inject('POST', '/auth/logout', { headers });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
      expect((await me({ cookie })).statusCode).toBe(200);
    });
  });

  describe('invite accept with client: mobile', () => {
    async function invite(email: string) {
      const w = await taskWorld(ctx);
      const res = await w.api('POST', `/workspaces/${w.ws.id}/invites`, { email });
      const { link } = createdInviteSchema.parse(res.json());
      return { w, token: new URL(link).pathname.replace('/invite/', '') };
    }

    it('signs a new account in with a token in the body', async () => {
      const email = `phone-${Date.now()}@kite.test`;
      const { w, token } = await invite(email);
      const res = await inject('POST', `/invites/${token}/accept`, {
        payload: { name: 'Phone Person', password: 'password123', client: 'mobile' },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      const body = authResultSchema.parse(res.json());
      expect(body.workspaces.map((ws) => ws.id)).toContain(w.ws.id);
      const session = body.session?.token ?? '';
      expect((await sessionRow(session)).client).toBe('mobile');
      expect((await me(bearer(session))).statusCode).toBe(200);
    });

    it('lets an existing account accept with its bearer token', async () => {
      const user = await createUser(ctx.db);
      const { w, token } = await invite(user.email);
      const anonymous = await inject('POST', `/invites/${token}/accept`, { payload: {} });
      expect(errorCode(anonymous)).toBe('LOGIN_REQUIRED');

      const session = await loginMobile(ctx.app, user.email);
      const res = await inject('POST', `/invites/${token}/accept`, {
        headers: bearer(session),
        payload: { client: 'mobile' },
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = authResultSchema.parse(res.json());
      expect(body.session).toBeUndefined(); // already signed in
      expect(body.workspaces.map((ws) => ws.id)).toContain(w.ws.id);
    });
  });

  describe('signed-in devices', () => {
    const list = async (headers: Record<string, string>) => {
      const res = await inject('GET', '/auth/sessions', { headers });
      expect(res.statusCode, res.body).toBe(200);
      return signedInDeviceSchema.array().parse(res.json());
    };

    it('lists my live sessions, marks the current one, and revokes one', async () => {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      const phone = await loginMobile(ctx.app, user.email, { deviceName: 'Pixel' });
      const dead = await loginMobile(ctx.app, user.email);
      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, hashToken(dead)));

      const devices = await list(bearer(phone));
      expect(devices).toHaveLength(2);
      const current = devices.find((d) => d.current);
      expect(current).toMatchObject({ client: 'mobile', deviceLabel: 'Pixel' });
      const web = devices.find((d) => !d.current);
      if (!web) throw new Error('expected the web session');
      expect(web.client).toBe('web');
      expect(JSON.stringify(devices)).not.toContain(hashToken(phone));

      // The phone signs the browser out.
      const revoke = await inject('DELETE', `/auth/sessions/${web.id}`, { headers: bearer(phone) });
      expect(revoke.statusCode).toBe(204);
      expect((await me({ cookie })).statusCode).toBe(401);
      expect(await list(bearer(phone))).toHaveLength(1);

      // Revoking the current session is a logout.
      const self = await inject('DELETE', `/auth/sessions/${current?.id}`, {
        headers: bearer(phone),
      });
      expect(self.statusCode).toBe(204);
      expect((await me(bearer(phone))).statusCode).toBe(401);
    });

    it("answers 404 for someone else's session and leaves it alone", async () => {
      const victim = await createUser(ctx.db);
      const victimToken = await loginMobile(ctx.app, victim.email);
      const [victimSession] = await list(bearer(victimToken));
      const attacker = await createUser(ctx.db);
      const attackerCookie = await login(ctx.app, attacker.email);

      const res = await inject('DELETE', `/auth/sessions/${victimSession?.id}`, {
        headers: { cookie: attackerCookie, origin: ORIGIN },
      });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
      expect((await me(bearer(victimToken))).statusCode).toBe(200);
    });
  });
});

describe('bearer tokens in logs', () => {
  it('never prints the token', async () => {
    const lines: string[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split('\n')));
    const ctx = await createTestApp({}, { logStream: stream });
    try {
      const user = await createUser(ctx.db);
      const token = await loginMobile(ctx.app, user.email);
      await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(token) });
      await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: bearer(token),
        payload: { name: 'Log Test' },
      });
      // Whatever a handler might log by mistake: the redaction paths still mask it.
      ctx.app.log.info({ headers: bearer(token) }, 'probe');
      const text = lines.join('\n');
      expect(text).toContain('/api/v1/auth/me');
      expect(text).not.toContain(token);
    } finally {
      await ctx.close();
    }
  });
});
