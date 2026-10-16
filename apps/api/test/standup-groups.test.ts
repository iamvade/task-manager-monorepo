import { standupGroupSchema, workspaceMemberSchema, type StandupGroup } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { standupEntries, workspaceHolidays, workspaceMembers } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

// Thursday Oct 8 2026, 10:00 in Ulaanbaatar.
const NOW = new Date('2026-10-08T02:00:00Z');

describe('standup groups', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const admin = await w.person('admin', 'Bat Od');
    const sara = await w.person('member', 'Sara Khan');
    const dorj = await w.person('member', 'Dorj Enkh');
    const outsider = await w.person(null, 'Out Sider');
    const groups = `/workspaces/${w.ws.id}/standup-groups`;
    const create = async (body: object, api = w.api) => {
      const res = await api('POST', groups, body);
      expect(res.statusCode, res.body).toBe(201);
      return standupGroupSchema.parse(res.json());
    };
    return { ...w, admin, sara, dorj, outsider, groups, create };
  }

  it('lets admins and owners create groups with the default schedule', async () => {
    const w = await world();
    const g = await w.create({ name: ' Mobile team ' });
    expect(g).toMatchObject({
      name: 'Mobile team',
      timezone: 'Asia/Ulaanbaatar',
      days: [0, 1, 2, 3, 4],
      postBy: '10:00',
      reminderAt: '09:30',
      meetingAt: '10:15',
      facilitatorId: w.owner.id,
      speakingOrder: 'posting_order',
      secondsPerPerson: 120,
      totalMeetingMinutes: 15,
      showBlockersFirst: true,
      markLinkedTasksBlocked: true,
      isMember: true,
      canEdit: true,
      today: '2026-10-08',
      meetsToday: true,
      myPosted: false,
      hasPosts: false,
    });
    expect(g.members.map((m) => m.user.id)).toEqual([w.owner.id]);

    const byAdmin = await w.create(
      { name: 'Design', memberIds: [w.sara.user.id, w.dorj.user.id] },
      w.admin.api,
    );
    // The creator isn't listed, so there's no facilitator yet.
    expect(byAdmin.facilitatorId).toBeNull();
    expect(byAdmin.members.map((m) => m.user.id)).toEqual([w.sara.user.id, w.dorj.user.id]);

    const res = await w.sara.api('POST', w.groups, { name: 'Mine' });
    expect(res.statusCode).toBe(403);
    expect((await w.outsider.api('POST', w.groups, { name: 'X' })).statusCode).toBe(404);
    expect(
      errorCode(await w.api('POST', w.groups, { name: 'X', memberIds: [w.outsider.user.id] })),
    ).toBe('INVALID_MEMBER');
  });

  it('shows every group to every member, by name, without archived ones', async () => {
    const w = await world();
    const b = await w.create({ name: 'Beta' });
    await w.create({ name: 'Alpha', memberIds: [w.sara.user.id] });
    const list = z.array(standupGroupSchema).parse((await w.dorj.api('GET', w.groups)).json());
    expect(list.map((g) => [g.name, g.isMember, g.canEdit])).toEqual([
      ['Alpha', false, false],
      ['Beta', false, false],
    ]);
    expect((await w.api('POST', `/standup-groups/${b.id}/archive`)).statusCode).toBe(200);
    const after = z.array(standupGroupSchema).parse((await w.dorj.api('GET', w.groups)).json());
    expect(after.map((g) => g.name)).toEqual(['Alpha']);
    // Still readable (Undo) and restorable.
    const archived = standupGroupSchema.parse(
      (await w.api('GET', `/standup-groups/${b.id}`)).json(),
    );
    expect(archived.archivedAt).not.toBeNull();
    await w.api('POST', `/standup-groups/${b.id}/restore`);
    expect((await w.dorj.api('GET', w.groups)).json<unknown[]>()).toHaveLength(2);
    expect((await w.outsider.api('GET', `/standup-groups/${b.id}`)).statusCode).toBe(404);
    expect((await w.outsider.api('GET', w.groups)).statusCode).toBe(404);
  });

  it('lets admins and the facilitator edit settings, not other members', async () => {
    const w = await world();
    const g = await w.create({
      name: 'Mobile',
      memberIds: [w.owner.id, w.sara.user.id, w.dorj.user.id],
    });
    const url = `/standup-groups/${g.id}`;
    let res = await w.api('PATCH', url, { facilitatorId: w.sara.user.id });
    expect(res.statusCode, res.body).toBe(200);

    expect((await w.dorj.api('PATCH', url, { name: 'Nope' })).statusCode).toBe(403);
    expect((await w.outsider.api('PATCH', url, { name: 'Nope' })).statusCode).toBe(404);

    res = await w.sara.api('PATCH', url, {
      name: 'Mobile squad',
      days: [4, 0, 2, 2],
      postBy: '10:30',
      reminderAt: null,
      meetingAt: null,
      timezone: 'Asia/Seoul',
      secondsPerPerson: 180,
      speakingOrder: 'alphabetical',
      totalMeetingMinutes: 20,
      showBlockersFirst: false,
      markLinkedTasksBlocked: false,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(standupGroupSchema.parse(res.json())).toMatchObject({
      name: 'Mobile squad',
      days: [0, 2, 4],
      postBy: '10:30',
      reminderAt: null,
      meetingAt: null,
      timezone: 'Asia/Seoul',
      secondsPerPerson: 180,
      speakingOrder: 'alphabetical',
      totalMeetingMinutes: 20,
      showBlockersFirst: false,
      markLinkedTasksBlocked: false,
      canEdit: true,
    });
    // An admin who isn't in the group can still manage it.
    expect((await w.admin.api('PATCH', url, { name: 'Mobile' })).statusCode).toBe(200);
  });

  it('validates the schedule', async () => {
    const w = await world();
    const g = await w.create({ name: 'Mobile' });
    const url = `/standup-groups/${g.id}`;
    for (const body of [
      { days: [] },
      { days: [7] },
      { postBy: '10:10' },
      { postBy: '25:00' },
      { timezone: 'Mars/Olympus' },
      { secondsPerPerson: 90 },
      { reminderAt: '10:00', postBy: '10:00' },
      { meetingAt: '09:45', postBy: '10:00' },
      {},
    ]) {
      expect((await w.api('PATCH', url, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    // Checked against the stored values too.
    expect(errorCode(await w.api('PATCH', url, { reminderAt: '10:30' }))).toBe('INVALID_SCHEDULE');
    expect(errorCode(await w.api('PATCH', url, { meetingAt: '09:00' }))).toBe('INVALID_SCHEDULE');
    expect(errorCode(await w.api('PATCH', url, { facilitatorId: w.sara.user.id }))).toBe(
      'INVALID_FACILITATOR',
    );
  });

  it('adds, removes and reorders members', async () => {
    const w = await world();
    const g = await w.create({ name: 'Mobile' });
    const base = `/standup-groups/${g.id}/members`;
    const ids = (res: { json: () => unknown }) =>
      standupGroupSchema.parse(res.json()).members.map((m) => m.user.id);

    expect(ids(await w.api('PUT', `${base}/${w.sara.user.id}`))).toEqual([
      w.owner.id,
      w.sara.user.id,
    ]);
    // Adding twice is a no-op.
    expect(ids(await w.api('PUT', `${base}/${w.sara.user.id}`))).toEqual([
      w.owner.id,
      w.sara.user.id,
    ]);
    expect(ids(await w.api('PUT', `${base}/${w.dorj.user.id}`))).toEqual([
      w.owner.id,
      w.sara.user.id,
      w.dorj.user.id,
    ]);
    expect(errorCode(await w.api('PUT', `${base}/${w.outsider.user.id}`))).toBe('INVALID_MEMBER');

    const moved = await w.api('POST', `${base}/${w.dorj.user.id}/move`, {
      prevId: null,
      nextId: w.owner.id,
    });
    expect(ids(moved)).toEqual([w.dorj.user.id, w.owner.id, w.sara.user.id]);

    // Removing the facilitator clears the role.
    const removed = standupGroupSchema.parse(
      (await w.api('DELETE', `${base}/${w.owner.id}`)).json(),
    );
    expect(removed.facilitatorId).toBeNull();
    expect(removed.members.map((m) => m.user.id)).toEqual([w.dorj.user.id, w.sara.user.id]);
    expect(removed.canEdit).toBe(true);

    expect((await w.dorj.api('PUT', `${base}/${w.dorj.user.id}`)).statusCode).toBe(403);
    expect((await w.api('POST', `${base}/${w.owner.id}/move`, {})).statusCode).toBe(404);

    // memberIds on PATCH replaces the list in order.
    const replaced = await w.api('PATCH', `/standup-groups/${g.id}`, {
      memberIds: [w.sara.user.id, w.admin.user.id],
      facilitatorId: w.admin.user.id,
    });
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(standupGroupSchema.parse(replaced.json())).toMatchObject({
      facilitatorId: w.admin.user.id,
      members: [{ user: { id: w.sara.user.id } }, { user: { id: w.admin.user.id } }],
    });
  });

  it('hides deactivated members and reports today’s state', async () => {
    const w = await world();
    const g = await w.create({ name: 'Mobile', memberIds: [w.owner.id, w.dorj.user.id] });
    await ctx.db
      .update(workspaceMembers)
      .set({ deactivatedAt: NOW })
      .where(
        and(eq(workspaceMembers.workspaceId, w.ws.id), eq(workspaceMembers.userId, w.dorj.user.id)),
      );
    await ctx.db.insert(standupEntries).values({
      groupId: g.id,
      userId: w.owner.id,
      date: '2026-10-08',
      status: 'posted',
      postedAt: NOW,
    });
    let got = standupGroupSchema.parse((await w.api('GET', `/standup-groups/${g.id}`)).json());
    expect(got.members.map((m) => m.user.id)).toEqual([w.owner.id]);
    expect(got).toMatchObject({ myPosted: true, hasPosts: true, meetsToday: true });

    await ctx.db
      .insert(workspaceHolidays)
      .values({ workspaceId: w.ws.id, date: '2026-10-08', name: 'Test' });
    got = standupGroupSchema.parse((await w.api('GET', `/standup-groups/${g.id}`)).json());
    expect(got.meetsToday).toBe(false);
  });

  it('carries members’ absences', async () => {
    const w = await world();
    const g: StandupGroup = await w.create({ name: 'Mobile', memberIds: [w.sara.user.id] });
    await w.sara.api('POST', `/workspaces/${w.ws.id}/members/${w.sara.user.id}/absences`, {
      startDate: '2030-10-08',
      endDate: '2030-10-11',
      note: 'Vacation',
    });
    const got = standupGroupSchema.parse((await w.api('GET', `/standup-groups/${g.id}`)).json());
    expect(got.members[0]?.absences).toMatchObject([
      { startDate: '2030-10-08', endDate: '2030-10-11', note: 'Vacation' },
    ]);
    const members = z
      .array(workspaceMemberSchema)
      .parse((await w.api('GET', `/workspaces/${w.ws.id}/members`)).json());
    expect(members.find((m) => m.user.id === w.sara.user.id)?.absences).toHaveLength(1);
  });
});
