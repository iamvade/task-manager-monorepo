import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standupMeetingStateSchema, type StandupMeetingState } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { standupMeetings, taskReferences, userAbsences } from '../src/db/schema/index.js';
import type { apiClient } from './fixtures.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';
import { taskWorld } from './task-setup.js';

type Api = ReturnType<typeof apiClient>;

// Thursday Oct 8 2026, 09:00 in Ulaanbaatar (UTC+8); the group posts by 10:00, meets 10:15.
const clock = testClock('2026-10-08T01:00:00Z');

describe('standup meetings', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** A group where Sara posted 09:05 and Dorj 09:10 (with a blocker); it's 10:15. */
  async function meetingWorld() {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:05:00Z');
    await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Hand off icons — by 2pm' }] });
    clock.set('2026-10-08T01:10:00Z');
    const dorjEntry = await w.post(w.dorj.api, {
      today: [{ kind: 'text', text: 'Refund flow' }],
      blockers: [{ text: 'Sandbox keys expired' }],
    });
    clock.set('2026-10-08T02:15:00Z');
    const base = `/standup-groups/${w.group.id}/days/today/meeting`;
    const call = async (
      api: Api,
      method: 'GET' | 'POST' | 'PATCH',
      path = '',
      body?: unknown,
      status = 200,
    ): Promise<StandupMeetingState> => {
      const r = await api(method, `${base}${path}`, body);
      expect(r.statusCode, r.body).toBe(status);
      return standupMeetingStateSchema.parse(r.json());
    };
    const fails = async (
      api: Api,
      method: 'GET' | 'POST' | 'PATCH',
      path: string,
      body?: unknown,
    ) => {
      const r = await api(method, `${base}${path}`, body);
      return { status: r.statusCode, code: r.statusCode >= 400 ? errorCode(r) : null };
    };
    return { ...w, dorjEntry, base, call, fails };
  }

  it('lets the facilitator drive; other members follow; outsiders get 403 / 404', async () => {
    const w = await meetingWorld();
    const before = await w.call(w.sara.api, 'GET');
    expect(before).toMatchObject({ meeting: null, canDrive: false });
    expect((await w.call(w.anu.api, 'GET')).canDrive).toBe(true);
    // Bat is an admin in the group, but the group has a facilitator who is in today.
    expect((await w.call(w.bat.api, 'GET')).canDrive).toBe(false);

    expect(await w.fails(w.sara.api, 'POST', '/start')).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await w.fails(w.oyun.api, 'GET', '')).toMatchObject({ status: 403 });
    expect(await w.fails(w.tuya.api, 'POST', '/start')).toMatchObject({ status: 403 });
    expect(await w.fails(w.outsider.api, 'GET', '')).toMatchObject({ status: 404 });

    const started = await w.call(w.anu.api, 'POST', '/start');
    expect(started.meeting).toMatchObject({
      facilitator: { id: w.owner.id },
      startedAt: '2026-10-08T02:15:00.000Z',
      currentUserId: w.sara.user.id,
      currentStartedAt: '2026-10-08T02:15:00.000Z',
    });
    // Idempotent while it runs.
    clock.set('2026-10-08T02:15:30Z');
    const again = await w.call(w.anu.api, 'POST', '/start');
    expect(again.meeting?.currentStartedAt).toBe('2026-10-08T02:15:00.000Z');
    // Followers read the same state.
    expect((await w.call(w.dorj.api, 'GET')).meeting?.currentUserId).toBe(w.sara.user.id);
  });

  it('hands driving to admins in the group when the facilitator is out', async () => {
    const w = await meetingWorld();
    await ctx.db
      .insert(userAbsences)
      .values({ userId: w.owner.id, startDate: '2026-10-08', endDate: '2026-10-08' });
    expect((await w.call(w.bat.api, 'GET')).canDrive).toBe(true);
    expect((await w.call(w.sara.api, 'GET')).canDrive).toBe(false);
    const started = await w.call(w.bat.api, 'POST', '/start');
    expect(started.meeting?.facilitator?.id).toBe(w.bat.user.id);
  });

  it('orders by posting time, then group position, out of office last and skipped', async () => {
    const w = await meetingWorld();
    await ctx.db
      .insert(userAbsences)
      .values({ userId: w.bat.user.id, startDate: '2026-10-07', endDate: '2026-10-09' });
    const { meeting } = await w.call(w.anu.api, 'POST', '/start');
    expect(meeting?.order.map((s) => [s.user.name, s.state])).toEqual([
      ['Sara Khan', 'posted'],
      ['Dorj Enkh', 'posted'],
      [expect.any(String), 'not_yet'],
      ['Bat Od', 'out'],
    ]);
    expect(meeting?.order[0]?.entryId).not.toBeNull();
    expect(await w.fails(w.anu.api, 'POST', '/advance', { toUserId: w.bat.user.id })).toEqual({
      status: 400,
      code: 'INVALID_SPEAKER',
    });
    expect(await w.fails(w.anu.api, 'POST', '/advance', { toUserId: w.oyun.user.id })).toEqual({
      status: 400,
      code: 'INVALID_SPEAKER',
    });
  });

  it('sorts alphabetically when the group asks for it', async () => {
    const w = await meetingWorld();
    const r = await w.api('PATCH', `/standup-groups/${w.group.id}`, {
      speakingOrder: 'alphabetical',
    });
    expect(r.statusCode, r.body).toBe(200);
    const { meeting } = await w.call(w.anu.api, 'POST', '/start');
    const names = meeting?.order.map((s) => s.user.name) ?? [];
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('accumulates each person’s time across turns and stores the total at the end', async () => {
    const w = await meetingWorld();
    await w.call(w.anu.api, 'POST', '/start'); // Sara from 10:15:00
    clock.set('2026-10-08T02:16:30Z');
    const toDorj = await w.call(w.anu.api, 'POST', '/advance', { toUserId: w.dorj.user.id });
    expect(toDorj.meeting).toMatchObject({
      currentUserId: w.dorj.user.id,
      currentStartedAt: '2026-10-08T02:16:30.000Z',
      durations: { [w.sara.user.id]: 90 },
    });
    clock.set('2026-10-08T02:17:00Z');
    await w.call(w.anu.api, 'POST', '/advance', { toUserId: w.sara.user.id });
    clock.set('2026-10-08T02:18:00Z');
    const ended = await w.call(w.anu.api, 'POST', '/end');
    expect(ended.meeting).toMatchObject({
      endedAt: '2026-10-08T02:18:00.000Z',
      currentUserId: null,
      currentStartedAt: null,
      durations: { [w.sara.user.id]: 150, [w.dorj.user.id]: 30 },
      totalSeconds: 180,
    });
    // Ending again changes nothing; there is no restart.
    expect((await w.call(w.anu.api, 'POST', '/end')).meeting?.totalSeconds).toBe(180);
    expect(await w.fails(w.anu.api, 'POST', '/start')).toEqual({
      status: 409,
      code: 'MEETING_ENDED',
    });
    expect(await w.fails(w.anu.api, 'POST', '/advance', { toUserId: w.dorj.user.id })).toEqual({
      status: 409,
      code: 'MEETING_ENDED',
    });
  });

  it('refuses to start on the wrong day, without a meeting time, or with everyone out', async () => {
    const w = await meetingWorld();
    const past = await w.anu.api(
      'POST',
      `/standup-groups/${w.group.id}/days/2026-10-07/meeting/start`,
    );
    expect([past.statusCode, errorCode(past)]).toEqual([409, 'STANDUP_DAY_CLOSED']);
    expect(await w.fails(w.anu.api, 'POST', '/advance', { toUserId: w.sara.user.id })).toEqual({
      status: 409,
      code: 'MEETING_NOT_STARTED',
    });

    await w.api('PATCH', `/standup-groups/${w.group.id}`, { meetingAt: null });
    expect(await w.fails(w.anu.api, 'POST', '/start')).toEqual({
      status: 409,
      code: 'MEETING_NOT_SCHEDULED',
    });
    await w.api('PATCH', `/standup-groups/${w.group.id}`, { meetingAt: '10:15' });

    // Nobody who posted, everyone out.
    const v = await standupWorld(ctx);
    await ctx.db.insert(userAbsences).values(
      [v.owner.id, v.bat.user.id, v.sara.user.id, v.dorj.user.id].map((userId) => ({
        userId,
        startDate: '2026-10-08',
        endDate: '2026-10-08',
      })),
    );
    // With the facilitator out, Bat (admin) drives, but there is nobody to speak.
    const r = await v.bat.api('POST', `/standup-groups/${v.group.id}/days/today/meeting/start`);
    expect([r.statusCode, errorCode(r)]).toEqual([409, 'NO_SPEAKERS']);

    // Saturday.
    clock.set('2026-10-10T02:15:00Z');
    expect(await w.fails(w.anu.api, 'POST', '/start')).toEqual({
      status: 409,
      code: 'NOT_STANDUP_DAY',
    });
  });

  it('autosaves notes privately and shows them on the day page once saved', async () => {
    const w = await meetingWorld();
    expect(await w.fails(w.anu.api, 'PATCH', '', { notes: 'x' })).toEqual({
      status: 409,
      code: 'MEETING_NOT_STARTED',
    });
    await w.call(w.anu.api, 'POST', '/start');
    expect(await w.fails(w.sara.api, 'PATCH', '', { notes: 'x' })).toMatchObject({ status: 403 });
    await w.call(w.anu.api, 'PATCH', '', { notes: '• Sara hands off icons by 2pm' });

    const live = await w.day(w.sara.api);
    expect(live.meeting).toMatchObject({ live: true, notes: null, notesSavedAt: null, tasks: [] });

    clock.set('2026-10-08T02:20:00Z');
    const saved = await w.call(w.anu.api, 'POST', '/save-notes', {
      notes: '• Sara hands off icons by 2pm\n• Revisit Monday',
    });
    expect(saved.meeting?.notesSavedAt).toBe('2026-10-08T02:20:00.000Z');
    const day = await w.day(w.sara.api);
    expect(day.meeting).toMatchObject({
      live: true,
      notes: '• Sara hands off icons by 2pm\n• Revisit Monday',
      facilitator: { id: w.owner.id },
    });
  });

  it('lists tasks created from a blocker or a Today item, without task activity', async () => {
    const w = await meetingWorld();
    await w.call(w.anu.api, 'POST', '/start');
    const task = await w.createTask({ title: 'Renew sandbox keys', assigneeIds: [w.dorj.user.id] });
    const activityBefore = (await w.activities(task.id)).length;
    const blockerId = w.dorjEntry.blockers[0]?.id;

    const added = await w.call(w.anu.api, 'POST', '/tasks', {
      taskId: task.id,
      sourceKind: 'blocker',
      sourceEntryId: w.dorjEntry.id,
      sourceBlockerId: blockerId,
    });
    const [made] = added.meeting?.tasks ?? [];
    expect(added.meeting?.tasks).toHaveLength(1);
    expect(made?.task).toMatchObject({ id: task.id, title: 'Renew sandbox keys' });
    expect(made?.assignee?.id).toBe(w.dorj.user.id);
    expect(made?.source).toMatchObject({
      kind: 'blocker',
      blockerId,
      user: { id: w.dorj.user.id },
    });
    // Idempotent.
    const again = await w.call(w.anu.api, 'POST', '/tasks', {
      taskId: task.id,
      sourceKind: 'blocker',
      sourceEntryId: w.dorjEntry.id,
      sourceBlockerId: blockerId,
    });
    expect(again.meeting?.tasks).toHaveLength(1);

    const today = await w.createTask({ title: 'Refund flow' });
    await w.call(w.anu.api, 'POST', '/tasks', {
      taskId: today.id,
      sourceKind: 'today',
      sourceEntryId: w.dorjEntry.id,
      sourceItemIndex: 0,
    });
    expect(
      await w.fails(w.anu.api, 'POST', '/tasks', {
        taskId: today.id,
        sourceKind: 'today',
        sourceEntryId: w.dorjEntry.id,
        sourceItemIndex: 5,
      }),
    ).toEqual({ status: 400, code: 'INVALID_SOURCE' });

    const other = await taskWorld(ctx);
    const foreign = await other.createTask({ title: 'Elsewhere' });
    expect(
      await w.fails(w.anu.api, 'POST', '/tasks', {
        taskId: foreign.id,
        sourceKind: 'blocker',
        sourceEntryId: w.dorjEntry.id,
        sourceBlockerId: blockerId,
      }),
    ).toEqual({ status: 400, code: 'INVALID_TASK' });

    expect(await w.activities(task.id)).toHaveLength(activityBefore);
    expect(
      await ctx.db.select().from(taskReferences).where(eq(taskReferences.targetTaskId, task.id)),
    ).toEqual([]);

    // Not on the day page until the notes are saved; then with their source.
    expect((await w.day(w.sara.api)).meeting?.tasks).toEqual([]);
    await w.call(w.anu.api, 'POST', '/save-notes', {});
    expect((await w.day(w.sara.api)).meeting?.tasks.map((t) => t.task.id)).toEqual([
      task.id,
      today.id,
    ]);
  });

  it('sends the meeting to the group’s members only', async () => {
    const w = await meetingWorld();
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      await w.anu.api('POST', `${w.base}/start`);
      const sent = publish.mock.calls
        .map(([e]) => e)
        .filter((e) => e.message.type === 'standup.meeting_changed');
      expect(sent).toHaveLength(1);
      const [e] = sent;
      expect(e?.to).toMatchObject({ workspaceId: w.ws.id });
      expect(new Set((e?.to as { userIds: string[] }).userIds)).toEqual(
        new Set([w.owner.id, w.bat.user.id, w.sara.user.id, w.dorj.user.id]),
      );
      // A no-op (start again) sends nothing.
      publish.mockClear();
      await w.anu.api('POST', `${w.base}/start`);
      expect(
        publish.mock.calls.filter(([e]) => e.message.type === 'standup.meeting_changed'),
      ).toEqual([]);
    } finally {
      publish.mockRestore();
    }
  });

  it('keeps meeting timing out of reports', async () => {
    const dir = join(import.meta.dirname, '../src/reports');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/standup/i);
    }
    const w = await meetingWorld();
    await w.call(w.anu.api, 'POST', '/start');
    const [row] = await ctx.db
      .select()
      .from(standupMeetings)
      .where(eq(standupMeetings.groupId, w.group.id));
    expect(row?.startedAt).not.toBeNull();
  });
});
