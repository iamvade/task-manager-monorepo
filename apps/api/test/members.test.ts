import { workspaceMemberSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, addMember, createUser, createWorkspace, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('PATCH /workspaces/:id/members/:userId', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const setRole = (workspaceId: string, userId: string, cookie: string, role: string) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/members/${userId}`,
      headers: { origin: ORIGIN, cookie },
      payload: { role },
    });

  async function world() {
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    const admin = await createUser(ctx.db);
    const member = await createUser(ctx.db);
    await addMember(ctx.db, ws.id, admin.id, 'admin');
    await addMember(ctx.db, ws.id, member.id, 'member');
    return {
      ws,
      owner,
      admin,
      member,
      ownerCookie: await login(ctx.app, owner.email),
      adminCookie: await login(ctx.app, admin.email),
      memberCookie: await login(ctx.app, member.email),
    };
  }

  it('lets admins and owners switch others between admin and member', async () => {
    const w = await world();
    const promoted = await setRole(w.ws.id, w.member.id, w.adminCookie, 'admin');
    expect(promoted.statusCode).toBe(200);
    expect(workspaceMemberSchema.parse(promoted.json())).toMatchObject({
      user: { id: w.member.id },
      role: 'admin',
    });
    const demoted = await setRole(w.ws.id, w.admin.id, w.ownerCookie, 'member');
    expect(workspaceMemberSchema.parse(demoted.json()).role).toBe('member');
  });

  it('forbids plain members', async () => {
    const w = await world();
    const res = await setRole(w.ws.id, w.admin.id, w.memberCookie, 'member');
    expect(res.statusCode).toBe(403);
  });

  it('never changes the owner or your own role', async () => {
    const w = await world();
    const owner = await setRole(w.ws.id, w.owner.id, w.adminCookie, 'member');
    expect(owner.statusCode).toBe(409);
    expect(errorCode(owner)).toBe('OWNER_ROLE');
    const self = await setRole(w.ws.id, w.admin.id, w.adminCookie, 'member');
    expect(self.statusCode).toBe(409);
    expect(errorCode(self)).toBe('OWN_ROLE');
    expect((await setRole(w.ws.id, w.member.id, w.adminCookie, 'owner')).statusCode).toBe(400);
  });

  it('hides other workspaces and non-members (404)', async () => {
    const w = await world();
    const other = await world();
    expect((await setRole(w.ws.id, w.member.id, other.ownerCookie, 'admin')).statusCode).toBe(404);
    expect((await setRole(w.ws.id, other.member.id, w.ownerCookie, 'admin')).statusCode).toBe(404);
  });

  const patch = (workspaceId: string, userId: string, cookie: string, payload: object) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/members/${userId}`,
      headers: { origin: ORIGIN, cookie },
      payload,
    });

  it('lets admins set job titles and capacity, the owner’s and their own included', async () => {
    const w = await world();
    const res = await patch(w.ws.id, w.member.id, w.adminCookie, {
      title: '  Frontend engineer ',
      capacityPoints: 10,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(workspaceMemberSchema.parse(res.json())).toMatchObject({
      title: 'Frontend engineer',
      capacityPoints: 10,
      role: 'member',
    });
    for (const target of [w.owner.id, w.admin.id]) {
      const ok = await patch(w.ws.id, target, w.adminCookie, { title: 'Lead', capacityPoints: 12 });
      expect(ok.statusCode, ok.body).toBe(200);
    }
    const cleared = await patch(w.ws.id, w.member.id, w.adminCookie, { title: '  ' });
    expect(workspaceMemberSchema.parse(cleared.json())).toMatchObject({
      title: null,
      capacityPoints: 10,
    });
  });

  it('defaults capacity to 15 and validates it', async () => {
    const w = await world();
    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${w.ws.id}/members`,
      headers: { cookie: w.memberCookie },
    });
    const members = workspaceMemberSchema.array().parse(list.json());
    expect(members.every((m) => m.capacityPoints === 15)).toBe(true);

    for (const payload of [
      { capacityPoints: -1 },
      { capacityPoints: 101 },
      { capacityPoints: 2.5 },
      {},
    ]) {
      expect((await patch(w.ws.id, w.member.id, w.adminCookie, payload)).statusCode).toBe(400);
    }
    const forbidden = await patch(w.ws.id, w.member.id, w.memberCookie, { title: 'Boss' });
    expect(forbidden.statusCode).toBe(403);
  });
});
