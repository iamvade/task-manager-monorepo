import { createdInviteSchema, createdPasswordResetSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, webBasePath, webUrl } from '../src/config.js';
import { users } from '../src/db/schema/index.js';
import {
  ORIGIN,
  PASSWORD,
  apiClient,
  createUser,
  createWorkspace,
  login,
  randomIp,
  sessionCookie,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const BASE = '/task-manager';

describe('WEB_ORIGIN with a path', () => {
  it('derives the base path and web links', () => {
    expect(webBasePath({ WEB_ORIGIN: 'https://kite.example' })).toBe('');
    expect(webBasePath({ WEB_ORIGIN: 'https://kite.example/' })).toBe('');
    expect(webBasePath({ WEB_ORIGIN: 'https://kite.example/task-manager/' })).toBe(BASE);
    expect(webUrl({ WEB_ORIGIN: 'https://kite.example' }, '/invite/x')).toBe(
      'https://kite.example/invite/x',
    );
    expect(webUrl({ WEB_ORIGIN: 'https://kite.example/task-manager' }, '/invite/x')).toBe(
      'https://kite.example/task-manager/invite/x',
    );
  });

  it('rejects a query or hash', () => {
    expect(() => loadConfig({ ...process.env, WEB_ORIGIN: 'https://kite.example/?a=1' })).toThrow();
    expect(() => loadConfig({ ...process.env, WEB_ORIGIN: 'https://kite.example/#x' })).toThrow();
  });

  describe(`served under ${BASE}`, () => {
    let ctx: Awaited<ReturnType<typeof createTestApp>>;

    beforeAll(async () => {
      ctx = await createTestApp({ WEB_ORIGIN: `${ORIGIN}${BASE}` });
    });

    afterAll(async () => {
      await ctx.close();
    });

    it('scopes the session cookie to the path; CSRF and CORS compare the bare origin', async () => {
      const owner = await createUser(ctx.db);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN },
        remoteAddress: randomIp(),
        payload: { email: owner.email, password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(sessionCookie(res)?.path).toBe(BASE);

      const logout = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: ORIGIN, cookie: `kite_session=${sessionCookie(res)?.value ?? ''}` },
      });
      expect(logout.statusCode).toBe(204);
      expect(sessionCookie(logout)?.path).toBe(BASE);

      // A foreign origin is still refused.
      const foreign = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: 'https://evil.example' },
        remoteAddress: randomIp(),
        payload: { email: owner.email, password: PASSWORD },
      });
      expect(foreign.statusCode).toBe(403);
    });

    it('puts the path into invite and password-reset links', async () => {
      const owner = await createUser(ctx.db);
      const ws = await createWorkspace(ctx.db, owner.id);
      const api = apiClient(ctx.app, await login(ctx.app, owner.email));
      const invite = await api('POST', `/workspaces/${ws.id}/invites`, {
        email: 'sub.path@kite.test',
        role: 'member',
      });
      expect(invite.statusCode).toBe(201);
      expect(createdInviteSchema.parse(invite.json()).link).toMatch(
        new RegExp(`^${ORIGIN}${BASE}/invite/[^/]+$`),
      );

      const vade = await createUser(ctx.db);
      await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, vade.id));
      const admin = apiClient(ctx.app, await login(ctx.app, vade.email));
      const reset = await admin('POST', `/admin/users/${owner.id}/password-reset`);
      expect(reset.statusCode).toBe(201);
      expect(createdPasswordResetSchema.parse(reset.json()).link).toMatch(
        new RegExp(`^${ORIGIN}${BASE}/reset-password/[^/]+$`),
      );
    });
  });
});
