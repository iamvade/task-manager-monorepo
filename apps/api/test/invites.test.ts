import { invitePreviewSchema, inviteSchema, meResponseSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newToken } from '../src/auth/tokens.js';
import { one } from '../src/db/rows.js';
import { invites } from '../src/db/schema/index.js';
import {
  ORIGIN,
  addMember,
  createUser,
  createWorkspace,
  login,
  sessionCookie,
  errorCode,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('invites', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const createInvite = (workspaceId: string, cookie: string, email: string, role = 'member') =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/invites`,
      headers: { origin: ORIGIN, cookie },
      payload: { email, role },
    });

  const accept = (token: string, payload: object, cookie?: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      payload,
    });

  /** Inserts an invite directly so the test knows the raw token (the API only logs it). */
  async function seedInvite(workspaceId: string, email: string, expiresInMs = 60_000) {
    const token = newToken();
    await ctx.db.insert(invites).values({
      workspaceId,
      email,
      role: 'member',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + expiresInMs),
    });
    return token;
  }

  async function workspaceWithOwner() {
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    return { owner, ws, cookie: await login(ctx.app, owner.email) };
  }

  describe('POST /workspaces/:id/invites', () => {
    it('lets admins invite and stores only the token hash', async () => {
      const { ws, cookie } = await workspaceWithOwner();
      const res = await createInvite(ws.id, cookie, 'New.Person@Kite.test', 'admin');
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ email: 'new.person@kite.test', role: 'admin' });
      expect(JSON.stringify(res.json())).not.toMatch(/token/i);

      const { id } = inviteSchema.parse(res.json());
      const row = one(await ctx.db.select().from(invites).where(eq(invites.id, id)));
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('forbids plain members', async () => {
      const { ws } = await workspaceWithOwner();
      const member = await createUser(ctx.db);
      await addMember(ctx.db, ws.id, member.id, 'member');
      const res = await createInvite(ws.id, await login(ctx.app, member.email), 'x@kite.test');
      expect(res.statusCode).toBe(403);
    });

    it('hides other workspaces (404)', async () => {
      const { ws } = await workspaceWithOwner();
      const outsider = await createUser(ctx.db);
      await createWorkspace(ctx.db, outsider.id);
      const res = await createInvite(ws.id, await login(ctx.app, outsider.email), 'x@kite.test');
      expect(res.statusCode).toBe(404);
    });

    it('refuses to invite an existing member', async () => {
      const { ws, owner, cookie } = await workspaceWithOwner();
      const res = await createInvite(ws.id, cookie, owner.email);
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('ALREADY_MEMBER');
    });
  });

  describe('accepting', () => {
    it('previews, creates the account, signs in and joins', async () => {
      const { ws } = await workspaceWithOwner();
      const email = `newbie-${Date.now()}@kite.test`;
      const token = await seedInvite(ws.id, email);

      const preview = await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
      expect(preview.statusCode).toBe(200);
      expect(invitePreviewSchema.parse(preview.json())).toMatchObject({
        workspace: { name: ws.name },
        email,
        accountExists: false,
      });

      expect((await accept(token, { name: 'Newbie' })).statusCode).toBe(400);

      const res = await accept(token, { name: 'Nara Gan', password: 'long enough pw' });
      expect(res.statusCode).toBe(200);
      const me = meResponseSchema.parse(res.json());
      expect(me.user).toMatchObject({ email, name: 'Nara Gan', initials: 'NG' });
      expect(me.workspaces.map((w) => [w.id, w.role])).toEqual([[ws.id, 'member']]);
      expect(sessionCookie(res)?.value).toBeTruthy();

      // Signed in with the new password; the link is spent.
      await login(ctx.app, email, 'long enough pw');
      expect((await accept(token, { name: 'Again', password: 'long enough pw' })).statusCode).toBe(
        404,
      );
    });

    it('rejects expired and unknown tokens', async () => {
      const { ws } = await workspaceWithOwner();
      const expired = await seedInvite(ws.id, 'late@kite.test', -1000);
      for (const token of [expired, newToken()]) {
        const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe('INVITE_INVALID');
      }
    });

    it('requires an existing account to be signed in as itself', async () => {
      const { ws } = await workspaceWithOwner();
      const existing = await createUser(ctx.db);
      const someoneElse = await createUser(ctx.db);
      const token = await seedInvite(ws.id, existing.email);

      const preview = await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
      expect(invitePreviewSchema.parse(preview.json()).accountExists).toBe(true);

      const anonymous = await accept(token, {});
      expect(anonymous.statusCode).toBe(401);
      expect(errorCode(anonymous)).toBe('LOGIN_REQUIRED');
      expect((await accept(token, {}, await login(ctx.app, someoneElse.email))).statusCode).toBe(
        401,
      );

      const res = await accept(token, {}, await login(ctx.app, existing.email));
      expect(res.statusCode).toBe(200);
      expect(meResponseSchema.parse(res.json()).workspaces.map((w) => w.id)).toContain(ws.id);
    });
  });
});
