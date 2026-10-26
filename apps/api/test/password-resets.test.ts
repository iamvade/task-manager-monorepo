import {
  adminUserSchema,
  createdPasswordResetSchema,
  passwordResetPreviewSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passwordResets, sessions, users } from '../src/db/schema/index.js';
import {
  ORIGIN,
  addMember,
  apiClient,
  bearer,
  createUser,
  createWorkspace,
  errorCode,
  login,
  loginMobile,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const unique = () => uuidv7().replace(/-/g, '').slice(-12);
const NEW_PASSWORD = 'a brand new password';

describe('password reset links (platform admin)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function vadeClient() {
    const user = await createUser(ctx.db);
    await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, user.id));
    return { user, api: apiClient(ctx.app, await login(ctx.app, user.email)) };
  }

  const tokenOf = (link: string) => new URL(link).pathname.split('/').pop() ?? '';
  const anon = () => apiClient(ctx.app);

  async function issue(api: ReturnType<typeof apiClient>, userId: string) {
    const res = await api('POST', `/admin/users/${userId}/password-reset`);
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    return createdPasswordResetSchema.parse(res.json());
  }

  async function signIn(email: string, password: string, ip = '10.9.9.9') {
    return ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      remoteAddress: ip,
      payload: { email, password },
    });
  }

  it('answers 404 to everyone but the platform admin', async () => {
    const owner = await createUser(ctx.db);
    await createWorkspace(ctx.db, owner.id);
    const api = apiClient(ctx.app, await login(ctx.app, owner.email));
    expect((await api('GET', '/admin/users')).statusCode).toBe(404);
    expect((await api('POST', `/admin/users/${owner.id}/password-reset`)).statusCode).toBe(404);
    expect((await anon()('GET', '/admin/users')).statusCode).toBe(401);
  });

  it('searches users by name or email with their workspaces, leaving platform admins out', async () => {
    const { api, user: vade } = await vadeClient();
    const tag = unique();
    const person = await createUser(ctx.db, {
      name: `Zaya ${tag}`,
      email: `zaya-${tag}@kite.test`,
    });
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    await addMember(ctx.db, ws.id, person.id);

    const byName = z
      .array(adminUserSchema)
      .parse((await api('GET', `/admin/users?q=${encodeURIComponent(`zaya ${tag}`)}`)).json());
    expect(byName.map((u) => u.id)).toEqual([person.id]);
    expect(byName[0]?.workspaces).toEqual([{ id: ws.id, name: ws.name }]);
    expect(byName[0]?.pendingReset).toBeNull();

    const byEmail = z
      .array(adminUserSchema)
      .parse((await api('GET', `/admin/users?q=zaya-${tag}@`)).json());
    expect(byEmail.map((u) => u.id)).toEqual([person.id]);

    // `%` matches itself, not everything.
    expect((await api('GET', '/admin/users?q=%25%25%25')).json()).toEqual([]);

    const self = z
      .array(adminUserSchema)
      .parse((await api('GET', `/admin/users?q=${encodeURIComponent(vade.email)}`)).json());
    expect(self).toEqual([]);
  });

  it('never makes a link for a platform admin or an unknown user', async () => {
    const { api } = await vadeClient();
    const other = await vadeClient();
    const res = await api('POST', `/admin/users/${other.user.id}/password-reset`);
    expect(res.statusCode).toBe(404);
    expect((await api('POST', `/admin/users/${uuidv7()}/password-reset`)).statusCode).toBe(404);
  });

  it('sets a new password once, signs the person out everywhere and leaves the old password dead', async () => {
    const { api } = await vadeClient();
    const person = await createUser(ctx.db);
    const cookie = await login(ctx.app, person.email);
    const token = await loginMobile(ctx.app, person.email);

    const reset = await issue(api, person.id);
    expect(reset.email).toBe(person.email);
    expect(reset.link).toMatch(/\/reset-password\/[\w-]+$/);

    // Issuing alone changes nothing.
    expect((await apiClient(ctx.app, cookie)('GET', '/auth/me')).statusCode).toBe(200);
    const listed = z
      .array(adminUserSchema)
      .parse((await api('GET', `/admin/users?q=${encodeURIComponent(person.email)}`)).json());
    expect(listed[0]?.pendingReset?.expiresAt).toBe(reset.expiresAt);

    const preview = await anon()('GET', `/password-resets/${tokenOf(reset.link)}`);
    expect(preview.statusCode).toBe(200);
    expect(passwordResetPreviewSchema.parse(preview.json())).toEqual({
      name: person.name,
      email: person.email,
      expiresAt: reset.expiresAt,
    });

    const short = await anon()('POST', `/password-resets/${tokenOf(reset.link)}`, {
      password: 'short',
    });
    expect(short.statusCode).toBe(400);

    const done = await anon()('POST', `/password-resets/${tokenOf(reset.link)}`, {
      password: NEW_PASSWORD,
    });
    expect(done.statusCode).toBe(204);

    expect((await apiClient(ctx.app, cookie)('GET', '/auth/me')).statusCode).toBe(401);
    const mobile = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(token),
    });
    expect(mobile.statusCode).toBe(401);
    const left = await ctx.db.select().from(sessions).where(eq(sessions.userId, person.id));
    expect(left).toEqual([]);

    expect((await signIn(person.email, 'correct horse battery')).statusCode).toBe(401);
    expect((await signIn(person.email, NEW_PASSWORD)).statusCode).toBe(200);

    const again = await anon()('POST', `/password-resets/${tokenOf(reset.link)}`, {
      password: 'yet another password',
    });
    expect(again.statusCode).toBe(404);
    expect(errorCode(again)).toBe('RESET_INVALID');
    expect((await anon()('GET', `/password-resets/${tokenOf(reset.link)}`)).statusCode).toBe(404);
  });

  it('replaces the earlier link and refuses expired ones', async () => {
    const { api } = await vadeClient();
    const person = await createUser(ctx.db);
    const first = await issue(api, person.id);
    const second = await issue(api, person.id);
    const stale = await anon()('GET', `/password-resets/${tokenOf(first.link)}`);
    expect(stale.statusCode).toBe(404);
    expect((await anon()('GET', `/password-resets/${tokenOf(second.link)}`)).statusCode).toBe(200);

    await ctx.db
      .update(passwordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResets.userId, person.id));
    const expired = await anon()('POST', `/password-resets/${tokenOf(second.link)}`, {
      password: NEW_PASSWORD,
    });
    expect(expired.statusCode).toBe(404);
    expect(errorCode(expired)).toBe('RESET_INVALID');
    expect(
      (await anon()('POST', '/password-resets/junk', { password: NEW_PASSWORD })).statusCode,
    ).toBe(404);
  });

  it('clears failed sign-ins, so a throttled person can sign in right after', async () => {
    const { api } = await vadeClient();
    const person = await createUser(ctx.db);
    const ip = '10.8.8.8';
    for (let i = 0; i < 5; i += 1) {
      expect((await signIn(person.email, 'wrong password', ip)).statusCode).toBe(401);
    }
    expect((await signIn(person.email, 'wrong password', ip)).statusCode).toBe(429);

    const reset = await issue(api, person.id);
    await anon()('POST', `/password-resets/${tokenOf(reset.link)}`, { password: NEW_PASSWORD });
    expect((await signIn(person.email, NEW_PASSWORD, ip)).statusCode).toBe(200);
  });
});
