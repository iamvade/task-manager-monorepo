import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standupSummaryResultSchema, type StandupSummaryResult } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { standupMeetings, taskReferences, userAbsences } from '../src/db/schema/index.js';
import type { apiClient } from './fixtures.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';
import { taskWorld } from './task-setup.js';

type Api = ReturnType<typeof apiClient>;

// Thursday Oct 8 2026, 09:00 in Ulaanbaatar (UTC+8); the group posts by 10:00.
const clock = testClock('2026-10-08T01:00:00Z');

describe('standup meeting summary', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Sara posted 09:05 and Dorj 09:10 (with a blocker); it's 10:30. Anu facilitates. */
  async function summaryWorld() {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:05:00Z');
    await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Hand off icons — by 2pm' }] });
    clock.set('2026-10-08T01:10:00Z');
    const dorjEntry = await w.post(w.dorj.api, {
      today: [{ kind: 'text', text: 'Refund flow' }],
      blockers: [{ text: 'Sandbox keys expired' }],
    });
    clock.set('2026-10-08T02:30:00Z');
    const base = (date = 'today') => `/standup-groups/${w.group.id}/days/${date}/summary`;
    const write = async (
      api: Api,
      method: 'PUT' | 'POST',
      path: string,
      body: Parameters<Api>[2],
      date = 'today',
    ): Promise<StandupSummaryResult> => {
      const r = await api(method, `${base(date)}${path}`, body);
      expect(r.statusCode, r.body).toBe(200);
      return standupSummaryResultSchema.parse(r.json());
    };
    const fails = async (
      api: Api,
      method: 'PUT' | 'POST',
      path: string,
      body: Parameters<Api>[2],
      date = 'today',
    ) => {
      const r = await api(method, `${base(date)}${path}`, body);
      return { status: r.statusCode, code: r.statusCode >= 400 ? errorCode(r) : null };
    };
    return { ...w, dorjEntry, base, write, fails };
  }

  it('lets the facilitator write it; members read it on the day page at once', async () => {
    const w = await summaryWorld();
    expect((await w.day(w.sara.api)).summary).toBeNull();
    expect((await w.day(w.sara.api)).canSummarize).toBe(false);
    expect((await w.day(w.anu.api)).canSummarize).toBe(true);
    // Bat is an admin in the group, but the facilitator is in today.
    expect((await w.day(w.bat.api)).canSummarize).toBe(false);

    const notes = { notes: '• Sara hands off icons by 2pm' };
    expect(await w.fails(w.sara.api, 'PUT', '', notes)).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await w.fails(w.bat.api, 'PUT', '', notes)).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await w.fails(w.oyun.api, 'PUT', '', notes)).toMatchObject({ status: 403 });
    expect(await w.fails(w.outsider.api, 'PUT', '', notes)).toMatchObject({ status: 404 });

    const saved = await w.write(w.anu.api, 'PUT', '', notes);
    expect(saved.summary).toMatchObject({
      notes: notes.notes,
      updatedBy: { id: w.owner.id },
      updatedAt: '2026-10-08T02:30:00.000Z',
      tasks: [],
    });
    expect((await w.day(w.sara.api)).summary).toMatchObject({ notes: notes.notes });
  });

  it('a no-op save writes nothing', async () => {
    const w = await summaryWorld();
    expect((await w.write(w.anu.api, 'PUT', '', { notes: '' })).summary).toBeNull();
    expect(
      await ctx.db.select().from(standupMeetings).where(eq(standupMeetings.groupId, w.group.id)),
    ).toEqual([]);
    await w.write(w.anu.api, 'PUT', '', { notes: 'x' });
    clock.set('2026-10-08T02:40:00Z');
    const again = await w.write(w.anu.api, 'PUT', '', { notes: 'x' });
    expect(again.summary?.updatedAt).toBe('2026-10-08T02:30:00.000Z');
  });

  it('hands it to admins in the group when the facilitator was out that day', async () => {
    const w = await summaryWorld();
    await ctx.db
      .insert(userAbsences)
      .values({ userId: w.owner.id, startDate: '2026-10-08', endDate: '2026-10-08' });
    expect((await w.day(w.bat.api)).canSummarize).toBe(true);
    expect((await w.day(w.sara.api)).canSummarize).toBe(false);
    const saved = await w.write(w.bat.api, 'PUT', '', { notes: 'Bat ran it' });
    expect(saved.summary?.updatedBy?.id).toBe(w.bat.user.id);
    // The facilitator always may, even on a day they were out.
    await w.write(w.anu.api, 'PUT', '', { notes: 'Anu added to it' });
  });

  it('works on past standup days; not on later days, closed days or archived groups', async () => {
    const w = await summaryWorld();
    // The next day: yesterday's summary is still open.
    clock.set('2026-10-09T03:00:00Z');
    await w.write(w.anu.api, 'PUT', '', { notes: 'Catching up' }, '2026-10-08');
    expect((await w.day(w.anu.api, '2026-10-08')).summary?.notes).toBe('Catching up');
    expect(await w.fails(w.anu.api, 'PUT', '', { notes: 'x' }, '2026-10-10')).toEqual({
      status: 400,
      code: 'INVALID_DATE',
    });
    // Saturday Oct 10 without posts.
    clock.set('2026-10-10T03:00:00Z');
    expect(await w.fails(w.anu.api, 'PUT', '', { notes: 'x' })).toEqual({
      status: 409,
      code: 'NOT_STANDUP_DAY',
    });
    expect((await w.day(w.anu.api)).canSummarize).toBe(false);
    // A day stops being a standup day (schedule change) but had posts: still open.
    const r = await w.api('PATCH', `/standup-groups/${w.group.id}`, { days: [0, 1, 2, 4] });
    expect(r.statusCode, r.body).toBe(200);
    await w.write(w.anu.api, 'PUT', '', { notes: 'Still here' }, '2026-10-08');

    expect((await w.api('POST', `/standup-groups/${w.group.id}/archive`)).statusCode).toBe(200);
    expect(await w.fails(w.anu.api, 'PUT', '', { notes: 'y' }, '2026-10-08')).toEqual({
      status: 409,
      code: 'GROUP_ARCHIVED',
    });
  });

  it('lists tasks created from a blocker or a Today item, without task activity', async () => {
    const w = await summaryWorld();
    const task = await w.createTask({ title: 'Renew sandbox keys', assigneeIds: [w.dorj.user.id] });
    const activityBefore = (await w.activities(task.id)).length;
    const blockerId = w.dorjEntry.blockers[0]?.id;
    const fromBlocker = {
      taskId: task.id,
      sourceKind: 'blocker',
      sourceEntryId: w.dorjEntry.id,
      sourceBlockerId: blockerId,
    };
    expect(await w.fails(w.sara.api, 'POST', '/tasks', fromBlocker)).toMatchObject({
      status: 403,
    });

    const added = await w.write(w.anu.api, 'POST', '/tasks', fromBlocker);
    const [made] = added.summary?.tasks ?? [];
    expect(added.summary?.tasks).toHaveLength(1);
    expect(made?.task).toMatchObject({ id: task.id, title: 'Renew sandbox keys' });
    expect(made?.assignee?.id).toBe(w.dorj.user.id);
    expect(made?.source).toMatchObject({
      kind: 'blocker',
      blockerId,
      user: { id: w.dorj.user.id },
    });
    // Idempotent.
    expect((await w.write(w.anu.api, 'POST', '/tasks', fromBlocker)).summary?.tasks).toHaveLength(
      1,
    );

    const today = await w.createTask({ title: 'Refund flow' });
    await w.write(w.anu.api, 'POST', '/tasks', {
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
      await w.fails(w.anu.api, 'POST', '/tasks', { ...fromBlocker, taskId: foreign.id }),
    ).toEqual({ status: 400, code: 'INVALID_TASK' });

    expect(await w.activities(task.id)).toHaveLength(activityBefore);
    expect(
      await ctx.db.select().from(taskReferences).where(eq(taskReferences.targetTaskId, task.id)),
    ).toEqual([]);
    expect((await w.day(w.sara.api)).summary?.tasks.map((t) => t.task.id)).toEqual([
      task.id,
      today.id,
    ]);
  });

  it('takes a carried-over blocker on a later day, but not a Today item', async () => {
    const w = await summaryWorld();
    // Friday: Dorj's Thursday blocker is still open and shows on Friday's page.
    clock.set('2026-10-09T03:00:00Z');
    const friday = await w.day(w.anu.api);
    expect(friday.blockers.map((b) => b.id)).toContain(w.dorjEntry.blockers[0]?.id);
    const task = await w.createTask({ title: 'Renew sandbox keys' });
    await w.write(w.anu.api, 'POST', '/tasks', {
      taskId: task.id,
      sourceKind: 'blocker',
      sourceEntryId: w.dorjEntry.id,
      sourceBlockerId: w.dorjEntry.blockers[0]?.id,
    });
    expect(
      await w.fails(w.anu.api, 'POST', '/tasks', {
        taskId: task.id,
        sourceKind: 'today',
        sourceEntryId: w.dorjEntry.id,
        sourceItemIndex: 0,
      }),
    ).toEqual({ status: 400, code: 'INVALID_SOURCE' });
  });

  it('tells the group’s members only', async () => {
    const w = await summaryWorld();
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      await w.anu.api('PUT', w.base(), { notes: 'Hello' });
      const sent = publish.mock.calls
        .map(([e]) => e)
        .filter((e) => e.message.type === 'standup.summary_changed');
      expect(sent).toHaveLength(1);
      const [e] = sent;
      expect(new Set(e && 'userIds' in e.to ? e.to.userIds : [])).toEqual(
        new Set([w.owner.id, w.bat.user.id, w.sara.user.id, w.dorj.user.id]),
      );
      publish.mockClear();
      await w.anu.api('PUT', w.base(), { notes: 'Hello' });
      expect(
        publish.mock.calls.filter(([e]) => e.message.type === 'standup.summary_changed'),
      ).toEqual([]);
    } finally {
      publish.mockRestore();
    }
  });

  it('keeps standups out of reports', () => {
    const dir = join(import.meta.dirname, '../src/reports');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/standup/i);
    }
  });
});
