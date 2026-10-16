import { standupBlockerSchema, standupEntrySchema, standupReplySchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { standupEntries, userAbsences } from '../src/db/schema/index.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

// Thursday Oct 8 2026, 09:00 in Ulaanbaatar (UTC+8); the group posts by 10:00.
const clock = testClock('2026-10-08T01:00:00Z');

describe('standup entries', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('flags a post after the post-by time in Asia/Ulaanbaatar as late, once', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:59:00Z'); // 09:59
    const onTime = await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Ship it' }] });
    expect(onTime).toMatchObject({
      status: 'posted',
      postedAt: '2026-10-08T01:59:00.000Z',
      isLate: false,
      editedAt: null,
    });

    clock.set('2026-10-08T02:01:00Z'); // 10:01
    const late = await w.post(w.dorj.api, { today: [{ kind: 'text', text: 'Review' }] });
    expect(late.isLate).toBe(true);

    // Editing later keeps the first post time and the flag; it stamps editedAt.
    clock.set('2026-10-08T03:00:00Z');
    const edited = await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Ship it today' }] });
    expect(edited).toMatchObject({
      postedAt: '2026-10-08T01:59:00.000Z',
      isLate: false,
      editedAt: '2026-10-08T03:00:00.000Z',
    });

    const day = await w.day();
    expect(day.members.find((m) => m.user.id === w.dorj.user.id)).toMatchObject({
      state: 'posted',
      isLate: true,
    });
  });

  it('writes nothing for a save that changes nothing', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const body = {
      yesterday: [{ kind: 'text' as const, text: 'Did things' }],
      blockers: [{ text: 'Waiting on API' }],
    };
    const first = await w.post(w.sara.api, body);
    clock.set('2026-10-08T01:30:00Z');
    const again = await w.post(w.sara.api, {
      ...body,
      blockers: [{ id: first.blockers[0]?.id, text: 'Waiting on API' }],
    });
    expect(again.editedAt).toBeNull();
    expect(again.blockers.map((b) => b.id)).toEqual(first.blockers.map((b) => b.id));
  });

  it('keeps drafts private and never goes back from posted to draft', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const draft = standupEntrySchema.parse(
      (
        await w.save(w.sara.api, {
          status: 'draft',
          today: [{ kind: 'text', text: 'Thinking' }],
        })
      ).json(),
    );
    expect(draft).toMatchObject({ status: 'draft', postedAt: null });

    const mine = await w.day(w.sara.api);
    expect(mine.myEntry?.id).toBe(draft.id);
    expect(mine.entries).toEqual([]);
    expect(mine.members.find((m) => m.user.id === w.sara.user.id)?.state).toBe('not_yet');
    expect((await w.day(w.dorj.api)).myEntry).toBeNull();
    // Someone else's draft can't be reacted to or replied to: it doesn't exist for them.
    expect(
      (await w.dorj.api('PUT', `/standup-entries/${draft.id}/reactions/eyes`)).statusCode,
    ).toBe(404);

    await w.post(w.sara.api, { today: [{ kind: 'text', text: 'Thinking' }] });
    const back = await w.save(w.sara.api, { status: 'draft' }, 'today', 409);
    expect(errorCode(back)).toBe('ALREADY_POSTED');
  });

  it('only accepts writes on the group’s today, until the day ends there', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const entry = await w.post(w.sara.api, {
      blockers: [{ text: 'Need keys', helperIds: [w.dorj.user.id] }],
    });
    const blockerId = entry.blockers[0]?.id;

    clock.set('2026-10-08T15:59:00Z'); // 23:59 the same day
    await w.post(w.sara.api, {
      today: [{ kind: 'text', text: 'Late edit' }],
      blockers: [{ id: blockerId, text: 'Need keys', helperIds: [w.dorj.user.id] }],
    });

    clock.set('2026-10-08T16:00:00Z'); // midnight: Friday Oct 9 in Ulaanbaatar
    const closed = await w.save(w.sara.api, { status: 'posted' }, '2026-10-08', 409);
    expect(errorCode(closed)).toBe('STANDUP_DAY_CLOSED');
    const future = await w.save(w.sara.api, { status: 'posted' }, '2026-10-10', 400);
    expect(errorCode(future)).toBe('INVALID_DATE');

    // Replies, reactions and resolving still work on the past day.
    const reply = await w.dorj.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: 'Sent them',
      blockerId,
    });
    expect(reply.statusCode, reply.body).toBe(201);
    expect(standupReplySchema.parse(reply.json()).blockerId).toBe(blockerId);
    expect(
      (await w.dorj.api('PUT', `/standup-entries/${entry.id}/reactions/heart`)).statusCode,
    ).toBe(200);
    const resolved = await w.dorj.api('POST', `/standup-blockers/${blockerId}/resolve`);
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(standupBlockerSchema.parse(resolved.json()).resolvedBy?.id).toBe(w.dorj.user.id);

    // Saturday isn't a standup day for a Mon–Fri group.
    clock.set('2026-10-10T02:00:00Z');
    const saturday = await w.save(w.sara.api, { status: 'posted' }, 'today', 409);
    expect(errorCode(saturday)).toBe('NOT_STANDUP_DAY');
  });

  it('shows who posted, who hasn’t and who is out, with earlier open blockers', async () => {
    const w = await standupWorld(ctx);
    // Wednesday: Dorj posts a blocker nobody resolves.
    clock.set('2026-10-07T01:00:00Z');
    const wed = await w.post(w.dorj.api, { blockers: [{ text: 'Old blocker' }] });
    // Thursday: Bat is out until Friday, Sara posts with a blocker, Anu posts without one.
    clock.set('2026-10-08T01:00:00Z');
    await ctx.db.insert(userAbsences).values({
      userId: w.bat.user.id,
      startDate: '2026-10-07',
      endDate: '2026-10-09',
    });
    await w.post(w.anu.api, { today: [{ kind: 'text', text: 'Plan' }] });
    clock.set('2026-10-08T01:10:00Z');
    await w.post(w.sara.api, { blockers: [{ text: 'Today blocker' }] });

    const day = await w.day();
    expect(day).toMatchObject({
      date: '2026-10-08',
      today: '2026-10-08',
      isStandupDay: true,
      prevDate: '2026-10-07',
      nextDate: null,
      editable: true,
      postByAt: '2026-10-08T02:00:00.000Z',
      postedCount: 2,
      expectedCount: 3,
    });
    expect(day.members.map((m) => [m.user.name, m.state, m.backOn])).toEqual([
      ['Anu Bold', 'posted', null],
      ['Bat Od', 'out', '2026-10-12'],
      ['Sara Khan', 'posted', null],
      ['Dorj Enkh', 'not_yet', null],
    ]);
    // Updates with open blockers first, then by post time.
    expect(day.entries.map((e) => e.user.name)).toEqual(['Sara Khan', 'Anu Bold']);
    expect(day.blockers.map((b) => [b.text, b.date])).toEqual([
      ['Old blocker', '2026-10-07'],
      ['Today blocker', '2026-10-08'],
    ]);
    expect(day.entries[0]?.reactions).toEqual([
      { emoji: 'thumbs_up', count: 0, mine: false },
      { emoji: 'eyes', count: 0, mine: false },
      { emoji: 'heart', count: 0, mine: false },
    ]);

    // Resolved earlier blockers no longer carry over; resolving is for the author, helpers,
    // the facilitator and admins in the group.
    const oldId = wed.blockers[0]?.id;
    expect((await w.sara.api('POST', `/standup-blockers/${oldId}/resolve`)).statusCode).toBe(403);
    expect((await w.anu.api('POST', `/standup-blockers/${oldId}/resolve`)).statusCode).toBe(200);
    expect((await w.day()).blockers.map((b) => b.text)).toEqual(['Today blocker']);
    // Still listed on its own day, resolved.
    const wedDay = await w.day(w.anu.api, '2026-10-07');
    expect(wedDay.blockers.map((b) => [b.text, b.resolvedAt !== null])).toEqual([
      ['Old blocker', true],
    ]);
    expect(wedDay).toMatchObject({ editable: false, nextDate: '2026-10-08' });
  });

  it('validates helpers and linked tasks', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const outsideHelper = await w.save(
      w.sara.api,
      { status: 'posted', blockers: [{ text: 'x', helperIds: [w.oyun.user.id] }] },
      'today',
      400,
    );
    expect(errorCode(outsideHelper)).toBe('INVALID_HELPER');
    const self = await w.save(
      w.sara.api,
      { status: 'posted', blockers: [{ text: 'x', helperIds: [w.sara.user.id] }] },
      'today',
      400,
    );
    expect(errorCode(self)).toBe('INVALID_HELPER');
    const badTask = await w.save(
      w.sara.api,
      {
        status: 'posted',
        today: [{ kind: 'task', taskId: '0190a0b0-0000-7000-8000-000000000000', text: 'x' }],
      },
      'today',
      400,
    );
    expect(errorCode(badTask)).toBe('INVALID_TASK');

    const task = await w.createTask({ title: 'Linked' });
    const entry = await w.post(w.sara.api, {
      yesterday: [{ kind: 'completed', taskId: task.id, text: 'Linked' }],
    });
    expect(entry.yesterday[0]?.task).toMatchObject({ id: task.id, key: task.key });
  });

  it('keeps standup content to group members', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const entry = await w.post(w.sara.api, { blockers: [{ text: 'Secret' }] });
    const blockerId = entry.blockers[0]?.id;
    const reply = standupReplySchema.parse(
      (await w.dorj.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'Hi' })).json(),
    );
    const g = w.group.id;
    const calls: [string, string, object?][] = [
      ['GET', `/standup-groups/${g}/days/today`],
      ['GET', `/standup-groups/${g}/suggestions`],
      ['PUT', `/standup-groups/${g}/days/today/entry`, { status: 'draft' }],
      ['PUT', `/standup-entries/${entry.id}/reactions/eyes`],
      ['DELETE', `/standup-entries/${entry.id}/reactions/eyes`],
      ['POST', `/standup-entries/${entry.id}/replies`, { body: 'Hey' }],
      ['PATCH', `/standup-replies/${reply.id}`, { body: 'Hey' }],
      ['DELETE', `/standup-replies/${reply.id}`],
      ['POST', `/standup-blockers/${blockerId}/resolve`],
      ['DELETE', `/standup-blockers/${blockerId}/resolve`],
    ];
    for (const [method, path, body] of calls) {
      // A workspace member outside the group, admins included: 403.
      for (const api of [w.oyun.api, w.tuya.api]) {
        const res = await api(method as 'GET', path, body);
        expect([method, path, res.statusCode]).toEqual([method, path, 403]);
      }
      // Outside the workspace: 404.
      const res = await w.outsider.api(method as 'GET', path, body);
      expect([method, path, res.statusCode]).toEqual([method, path, 404]);
    }
    // The group itself (settings) is still readable by everyone in the workspace.
    expect((await w.oyun.api('GET', `/standup-groups/${g}`)).statusCode).toBe(200);
    // Only the author edits or deletes a reply.
    expect(
      (await w.sara.api('PATCH', `/standup-replies/${reply.id}`, { body: 'x' })).statusCode,
    ).toBe(403);
  });

  it('toggles reactions and keeps replies with mentions of group members', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const entry = await w.post(w.sara.api);
    for (const api of [w.dorj.api, w.anu.api, w.dorj.api]) {
      await api('PUT', `/standup-entries/${entry.id}/reactions/thumbs_up`);
    }
    const off = await w.anu.api('DELETE', `/standup-entries/${entry.id}/reactions/thumbs_up`);
    expect(off.json()).toEqual([
      { emoji: 'thumbs_up', count: 1, mine: false },
      { emoji: 'eyes', count: 0, mine: false },
      { emoji: 'heart', count: 0, mine: false },
    ]);

    const res = await w.dorj.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: '@Anu @Oyun look',
      mentionIds: [w.anu.user.id, w.oyun.user.id],
    });
    const reply = standupReplySchema.parse(res.json());
    // Oyun isn't in the group: dropped.
    expect(reply.mentions.map((m) => m.id)).toEqual([w.anu.user.id]);
    const edited = standupReplySchema.parse(
      (
        await w.dorj.api('PATCH', `/standup-replies/${reply.id}`, {
          body: 'look again',
          mentionIds: [],
        })
      ).json(),
    );
    expect(edited).toMatchObject({ body: 'look again', mentions: [] });
    expect(edited.editedAt).not.toBeNull();
    expect((await w.day()).entries[0]?.replies.map((r) => r.body)).toEqual(['look again']);
    expect((await w.dorj.api('DELETE', `/standup-replies/${reply.id}`)).statusCode).toBe(204);
    expect((await w.day()).entries[0]?.replies).toEqual([]);

    const missing = await w.dorj.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: 'x',
      blockerId: '0190a0b0-0000-7000-8000-000000000000',
    });
    expect(errorCode(missing)).toBe('INVALID_BLOCKER');
  });

  it('rejects writes in an archived group but still reads it', async () => {
    const w = await standupWorld(ctx);
    clock.set('2026-10-08T01:00:00Z');
    const entry = await w.post(w.sara.api);
    await w.api('POST', `/standup-groups/${w.group.id}/archive`);
    const res = await w.save(w.sara.api, { status: 'posted' }, 'today', 409);
    expect(errorCode(res)).toBe('GROUP_ARCHIVED');
    const react = await w.dorj.api('PUT', `/standup-entries/${entry.id}/reactions/eyes`);
    expect(errorCode(react)).toBe('GROUP_ARCHIVED');
    expect((await w.day(w.sara.api)).editable).toBe(false);
    const [row] = await ctx.db.select().from(standupEntries).where(eq(standupEntries.id, entry.id));
    expect(row?.status).toBe('posted');
  });
});
