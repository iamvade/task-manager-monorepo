import { createdInviteSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, webBasePath, webUrl, type Config } from '../src/config.js';
import {
  ORIGIN,
  PASSWORD,
  createUser,
  createWorkspace,
  randomIp,
  sessionCookie,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const config = (WEB_ORIGIN: string): Config => ({ ...loadConfig(), WEB_ORIGIN });

describe('WEB_ORIGIN with a path', () => {
  it('derives the base path and web links', () => {
    expect(webBasePath(config('https://kite.example'))).toBe('');
    expect(webBasePath(config('https://kite.example/tasks/'))).toBe('/tasks');
    expect(webUrl(config('https://kite.example/tasks'), '/invite/x')).toBe(
      'https://kite.example/tasks/invite/x',
    );
  });

  it('rejects a query or hash', () => {
    expect(() => loadConfig({ ...process.env, WEB_ORIGIN: 'https://kite.example/?a=1' })).toThrow();
  });

  describe('served under /tasks', () => {
    let ctx: Awaited<ReturnType<typeof createTestApp>>;

    beforeAll(async () => {
      ctx = await createTestApp({ WEB_ORIGIN: `${ORIGIN}/tasks` });
    });

    afterAll(async () => {
      await ctx.close();
    });

    it('scopes the session cookie and invite links to the path; CSRF and CORS use the origin', async () => {
      const owner = await createUser(ctx.db);
      const ws = await createWorkspace(ctx.db, owner.id);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN },
        remoteAddress: randomIp(),
        payload: { email: owner.email, password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
      const cookie = sessionCookie(res);
      expect(cookie?.path).toBe('/tasks');

      const invite = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${ws.id}/invites`,
        headers: { origin: ORIGIN, cookie: `kite_session=${cookie?.value ?? ''}` },
        payload: { email: 'sub.path@kite.test', role: 'member' },
      });
      expect(invite.statusCode).toBe(201);
      const { link } = createdInviteSchema.parse(invite.json());
      expect(link).toMatch(new RegExp(`^${ORIGIN}/tasks/invite/[^/]+$`));
    });
  });
});
