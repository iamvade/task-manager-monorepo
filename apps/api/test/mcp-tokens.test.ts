import { mcpTokenSchema, meResponseSchema, signedInDeviceSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { one } from '../src/db/rows.js';
import { sessions } from '../src/db/schema/index.js';
import {
  ORIGIN,
  PASSWORD,
  bearer,
  createUser,
  errorCode,
  login,
  loginMobile,
  randomIp,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('MCP tokens (Settings → Connect Claude)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const inject = (method: InjectOptions['method'], url: string, opts: InjectOptions = {}) =>
    ctx.app.inject({ ...opts, method, url: `/api/v1${url}` });

  const createToken = (cookie: string, payload: Record<string, unknown> = {}) =>
    inject('POST', '/auth/mcp-tokens', { headers: { cookie, origin: ORIGIN }, payload });

  async function newToken(name?: string) {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx.app, user.email);
    const res = await createToken(cookie, name ? { name } : {});
    expect(res.statusCode, res.body).toBe(201);
    return { user, cookie, created: mcpTokenSchema.parse(res.json()) };
  }

  it('returns a bearer token once, stored as an mcp session', async () => {
    const { user, created } = await newToken();
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.deviceLabel).toBe('Claude Desktop');

    const row = one(
      await ctx.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken(created.token))),
    );
    expect(row).toMatchObject({ userId: user.id, client: 'mcp', publicId: created.id });

    const me = await inject('GET', '/auth/me', { headers: bearer(created.token) });
    expect(me.statusCode).toBe(200);
    expect(meResponseSchema.parse(me.json()).user.id).toBe(user.id);
  });

  it('labels the token with the given name in Signed-in devices', async () => {
    const { cookie, created } = await newToken('Claude on work Mac');
    const res = await inject('GET', '/auth/sessions', { headers: { cookie } });
    const devices = signedInDeviceSchema.array().parse(res.json());
    expect(devices.find((d) => d.id === created.id)).toMatchObject({
      client: 'mcp',
      deviceLabel: 'Claude on work Mac',
      current: false,
    });
  });

  it('cannot be made with a bearer session (mobile or another MCP token)', async () => {
    const { user, created } = await newToken();
    const mobile = await loginMobile(ctx.app, user.email);
    for (const token of [mobile, created.token]) {
      const res = await inject('POST', '/auth/mcp-tokens', { headers: bearer(token), payload: {} });
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('COOKIE_SESSION_REQUIRED');
    }
  });

  it('needs a signed-in user and the web origin', async () => {
    const anon = await inject('POST', '/auth/mcp-tokens', {
      headers: { origin: ORIGIN },
      payload: {},
    });
    expect(anon.statusCode).toBe(401);

    const user = await createUser(ctx.db);
    const cookie = await login(ctx.app, user.email);
    const foreign = await inject('POST', '/auth/mcp-tokens', {
      headers: { cookie, origin: 'https://evil.example' },
      payload: {},
    });
    expect(foreign.statusCode).toBe(403);
    expect(errorCode(foreign)).toBe('CSRF_REJECTED');
  });

  it('password sign-in cannot ask for an mcp session', async () => {
    const user = await createUser(ctx.db);
    const res = await inject('POST', '/auth/login', {
      remoteAddress: randomIp(),
      payload: { email: user.email, password: PASSWORD, client: 'mcp' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('has no 90-day cap but still lapses when expired', async () => {
    const { cookie, created } = await newToken();
    const hash = hashToken(created.token);
    await ctx.db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 200 * DAY), expiresAt: new Date(Date.now() + DAY) })
      .where(eq(sessions.id, hash));
    expect((await inject('GET', '/auth/me', { headers: bearer(created.token) })).statusCode).toBe(
      200,
    );
    const listed = signedInDeviceSchema
      .array()
      .parse((await inject('GET', '/auth/sessions', { headers: { cookie } })).json());
    expect(listed.some((d) => d.id === created.id)).toBe(true);

    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hash));
    expect((await inject('GET', '/auth/me', { headers: bearer(created.token) })).statusCode).toBe(
      401,
    );
  });

  it('ends when revoked from Signed-in devices', async () => {
    const { cookie, created } = await newToken();
    const del = await inject('DELETE', `/auth/sessions/${created.id}`, {
      headers: { cookie, origin: ORIGIN },
    });
    expect(del.statusCode).toBe(204);
    expect((await inject('GET', '/auth/me', { headers: bearer(created.token) })).statusCode).toBe(
      401,
    );
  });

  it('can write without an Origin header (bearer, no cookie)', async () => {
    const { created } = await newToken();
    const res = await inject('POST', '/auth/logout', { headers: bearer(created.token) });
    expect(res.statusCode).toBe(204);
  });
});
