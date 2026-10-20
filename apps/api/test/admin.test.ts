import {
  adminWorkspaceSchema,
  createdInviteSchema,
  createdOwnerInviteSchema,
  createdWorkspaceSchema,
  meResponseSchema,
} from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../src/db/holidays.js';
import { users, workspaceHolidays, workspaceMembers } from '../src/db/schema/index.js';
import { SetupError, createAccount } from '../src/setup/workspaces.js';
import {
  addMember,
  apiClient,
  createUser,
  createWorkspace,
  errorCode,
  login,
  sessionCookie,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

const unique = () => uuidv7().replace(/-/g, '').slice(-12);

describe('platform admin (vade)', () => {
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

  async function createWs(api: ReturnType<typeof apiClient>, ownerEmail?: string) {
    const slug = `adm-${unique()}`;
    const res = await api('POST', '/admin/workspaces', {
      name: `Admin ${slug}`,
      slug,
      ownerEmail: ownerEmail ?? `owner-${unique()}@kite.test`,
    });
    expect(res.statusCode).toBe(201);
    return createdWorkspaceSchema.parse(res.json());
  }

  it('answers 404 to everyone but the platform admin', async () => {
    const owner = await createUser(ctx.db);
    await createWorkspace(ctx.db, owner.id);
    const api = apiClient(ctx.app, await login(ctx.app, owner.email));
    expect((await api('GET', '/admin/workspaces')).statusCode).toBe(404);
    const created = await api('POST', '/admin/workspaces', {
      name: 'Nope',
      slug: `nope-${unique()}`,
      ownerEmail: 'x@kite.test',
    });
    expect(created.statusCode).toBe(404);
    expect((await apiClient(ctx.app)('GET', '/admin/workspaces')).statusCode).toBe(401);
  });

  it('reports the role on /auth/me and has no workspaces', async () => {
    const { api } = await vadeClient();
    const me = meResponseSchema.parse((await api('GET', '/auth/me')).json());
    expect(me.user.platformRole).toBe('vade');
    expect(me.workspaces).toEqual([]);
  });

  it('creates a workspace with holidays and a pending owner invite', async () => {
    const { api } = await vadeClient();
    const ownerEmail = `Owner-${unique()}@Kite.test`;
    const res = await api('POST', '/admin/workspaces', {
      name: 'Acme',
      slug: `acme-${unique()}`,
      ownerEmail,
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { workspace, invite } = createdWorkspaceSchema.parse(res.json());
    expect(workspace).toMatchObject({
      name: 'Acme',
      memberCount: 0,
      owner: null,
      ownerInvite: { email: ownerEmail.toLowerCase() },
    });
    expect(invite.email).toBe(ownerEmail.toLowerCase());

    const holidays = await ctx.db
      .select()
      .from(workspaceHolidays)
      .where(eq(workspaceHolidays.workspaceId, workspace.id));
    expect(holidays).toHaveLength(MN_PUBLIC_HOLIDAYS_2026.length);

    const list = z
      .array(adminWorkspaceSchema)
      .parse((await api('GET', '/admin/workspaces')).json());
    const row = list.find((w) => w.id === workspace.id);
    expect(row?.ownerInvite?.email).toBe(ownerEmail.toLowerCase());

    // The preview names the owner role; workspace admins never see the owner invite.
    const preview = await apiClient(ctx.app)('GET', `/invites/${tokenOf(invite.link)}`);
    expect(preview.json()).toMatchObject({ role: 'owner', accountExists: false });
  });

  it('rejects a used slug and a platform admin as owner', async () => {
    const { user, api } = await vadeClient();
    const { workspace } = await createWs(api);
    const taken = await api('POST', '/admin/workspaces', {
      name: 'Again',
      slug: workspace.slug,
      ownerEmail: 'someone@kite.test',
    });
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe('SLUG_TAKEN');

    const self = await api('POST', '/admin/workspaces', {
      name: 'Mine',
      slug: `mine-${unique()}`,
      ownerEmail: user.email,
    });
    expect(self.statusCode).toBe(409);
    expect(errorCode(self)).toBe('INVALID_OWNER');

    const bad = await api('POST', '/admin/workspaces', {
      name: 'Bad',
      slug: 'Not A Slug!',
      ownerEmail: 'a@kite.test',
    });
    expect(bad.statusCode).toBe(400);
  });

  it('makes a new account the owner, then refuses further owner links', async () => {
    const { api } = await vadeClient();
    const { workspace, invite } = await createWs(api);

    const accept = await apiClient(ctx.app)('POST', `/invites/${tokenOf(invite.link)}/accept`, {
      name: 'New Owner',
      password: 'password123',
    });
    expect(accept.statusCode).toBe(200);
    expect(sessionCookie(accept)).toBeTruthy();
    const me = meResponseSchema.parse(accept.json());
    expect(me.workspaces).toEqual([expect.objectContaining({ id: workspace.id, role: 'owner' })]);

    const reissue = await api('POST', `/admin/workspaces/${workspace.id}/owner-invite`, {
      email: 'other@kite.test',
    });
    expect(reissue.statusCode).toBe(409);
    expect(errorCode(reissue)).toBe('OWNER_EXISTS');

    const list = z
      .array(adminWorkspaceSchema)
      .parse((await api('GET', '/admin/workspaces')).json());
    const row = list.find((w) => w.id === workspace.id);
    expect(row).toMatchObject({ memberCount: 1, owner: { name: 'New Owner' }, ownerInvite: null });
  });

  it('re-issuing revokes the earlier link; an existing account accepts signed in', async () => {
    const { api } = await vadeClient();
    const { workspace, invite: first } = await createWs(api);
    const existing = await createUser(ctx.db);

    const res = await api('POST', `/admin/workspaces/${workspace.id}/owner-invite`, {
      email: existing.email,
    });
    expect(res.statusCode).toBe(201);
    const second = createdOwnerInviteSchema.parse(res.json());

    const old = await apiClient(ctx.app)('GET', `/invites/${tokenOf(first.link)}`);
    expect(errorCode(old)).toBe('INVITE_INVALID');

    const cookie = await login(ctx.app, existing.email);
    const accept = await apiClient(ctx.app, cookie)(
      'POST',
      `/invites/${tokenOf(second.link)}/accept`,
      {},
    );
    expect(accept.statusCode).toBe(200);
    const [member] = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, existing.id),
        ),
      );
    expect(member?.role).toBe('owner');
  });

  it('an owner link stops working once the workspace has an owner', async () => {
    const { api } = await vadeClient();
    const { workspace, invite } = await createWs(api);
    const owner = await createUser(ctx.db);
    await addMember(ctx.db, workspace.id, owner.id, 'owner');

    const preview = await apiClient(ctx.app)('GET', `/invites/${tokenOf(invite.link)}`);
    expect(errorCode(preview)).toBe('INVITE_INVALID');
    const accept = await apiClient(ctx.app)('POST', `/invites/${tokenOf(invite.link)}/accept`, {
      name: 'Late',
      password: 'password123',
    });
    expect(errorCode(accept)).toBe('INVITE_INVALID');
  });

  it('never lets the platform admin join a workspace', async () => {
    const { user, api } = await vadeClient();
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    const ownerApi = apiClient(ctx.app, await login(ctx.app, owner.email));
    const created = await ownerApi('POST', `/workspaces/${ws.id}/invites`, { email: user.email });
    expect(created.statusCode).toBe(201);
    const token = tokenOf(createdInviteSchema.parse(created.json()).link);

    expect(errorCode(await api('GET', `/invites/${token}`))).toBe('INVITE_INVALID');
    expect(errorCode(await api('POST', `/invites/${token}/accept`, {}))).toBe('INVITE_INVALID');

    // And sees nothing inside workspaces.
    expect((await api('GET', `/workspaces/${ws.id}/sidebar`)).statusCode).toBe(404);
    expect((await api('GET', `/workspaces/${ws.id}/members`)).statusCode).toBe(404);
  });

  it('createAccount makes a vade account and refuses a taken email', async () => {
    const email = `vade-${unique()}@kite.test`;
    const input = { email, name: 'Vade', password: 'password123' };
    const user = await ctx.db.transaction((tx) => createAccount(tx, input, 'vade'));
    const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ platformRole: 'vade', locale: 'mn', timezone: 'Asia/Ulaanbaatar' });
    await expect(createAccount(ctx.db, input)).rejects.toMatchObject({
      constructor: SetupError,
      code: 'EMAIL_TAKEN',
    });
  });
});
