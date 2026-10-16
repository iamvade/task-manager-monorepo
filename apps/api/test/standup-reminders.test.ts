import { notificationPageSchema } from '@kite/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications, userAbsences, workspaceHolidays } from '../src/db/schema/index.js';
import { runStandupNotices } from '../src/standups/notices-job.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

const clock = testClock('2026-10-08T01:00:00Z'); // Thursday 09:00 in Ulaanbaatar

describe('standup reminders and digest', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    clock.set('2026-10-08T01:00:00Z');
    const w = await standupWorld(ctx);
    const people = [w.anu, w.bat, w.sara, w.dorj, w.oyun];
    /** Notification types per person (in the group's order), for this world only. */
    const sent = async (type: 'standup_reminder' | 'standup_digest') => {
      const rows = await ctx.db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, type),
            inArray(
              notifications.userId,
              people.map((p) => p.user.id),
            ),
          ),
        );
      return people
        .filter((p) => rows.some((r) => r.userId === p.user.id))
        .map((p) => p.user.name)
        .concat(rows.length > new Set(rows.map((r) => r.userId)).size ? ['(duplicate)'] : []);
    };
    const run = (iso: string, app = ctx.app) => {
      clock.set(iso);
      return runStandupNotices(app, new Date(iso));
    };
    return { ...w, sent, run };
  }

  it('reminds members who haven’t posted and aren’t out, once, across restarts', async () => {
    const w = await world();
    await w.post(w.sara.api); // posted
    await ctx.db.insert(userAbsences).values({
      userId: w.dorj.user.id,
      startDate: '2026-10-08',
      endDate: '2026-10-08',
    });

    await w.run('2026-10-08T01:29:00Z'); // 09:29: too early
    expect(await w.sent('standup_reminder')).toEqual([]);

    await w.run('2026-10-08T01:31:00Z'); // 09:31
    expect(await w.sent('standup_reminder')).toEqual(['Anu Bold', 'Bat Od']);
    await w.run('2026-10-08T01:45:00Z');
    expect(await w.sent('standup_reminder')).toEqual(['Anu Bold', 'Bat Od']);

    // A restarted API (a new instance on the same database) doesn't send them again.
    const restarted = await createTestApp({}, { now: clock.now });
    try {
      await w.run('2026-10-08T01:50:00Z', restarted.app);
    } finally {
      await restarted.close();
    }
    expect(await w.sent('standup_reminder')).toEqual(['Anu Bold', 'Bat Od']);

    const reminder = notificationPageSchema.parse(
      (await w.bat.api('GET', `/me/notifications?workspaceId=${w.ws.id}`)).json(),
    ).items[0];
    expect(reminder).toMatchObject({
      type: 'standup_reminder',
      actor: null,
      task: null,
      standup: { groupId: w.group.id, date: '2026-10-08', entryId: null },
    });
  });

  it('sends no reminder after the post-by time, on weekends or on holidays', async () => {
    const w = await world();
    await w.run('2026-10-08T02:05:00Z'); // 10:05: missed the window
    expect(await w.sent('standup_reminder')).toEqual([]);
    await w.run('2026-10-10T01:31:00Z'); // Saturday
    expect(await w.sent('standup_reminder')).toEqual([]);
    await ctx.db
      .insert(workspaceHolidays)
      .values({ workspaceId: w.ws.id, date: '2026-10-09', name: 'Holiday' });
    await w.run('2026-10-09T01:31:00Z'); // Friday, a holiday
    expect(await w.sent('standup_reminder')).toEqual([]);
  });

  it('sends the facilitator one digest after the post-by time', async () => {
    const w = await world();
    await w.post(w.sara.api, { blockers: [{ text: 'Blocked on review' }] });
    await ctx.db.insert(userAbsences).values({
      userId: w.dorj.user.id,
      startDate: '2026-10-07',
      endDate: '2026-10-09',
    });
    await w.run('2026-10-08T01:59:00Z');
    expect(await w.sent('standup_digest')).toEqual([]);
    await w.run('2026-10-08T02:00:00Z');
    await w.run('2026-10-08T05:00:00Z');
    expect(await w.sent('standup_digest')).toEqual(['Anu Bold']);

    const digest = notificationPageSchema
      .parse((await w.api('GET', `/me/notifications?workspaceId=${w.ws.id}`)).json())
      .items.find((n) => n.type === 'standup_digest');
    expect(digest?.digest).toMatchObject({
      posted: [{ id: w.sara.user.id }],
      notPosted: [{ id: w.anu.user.id }, { id: w.bat.user.id }],
      out: [{ id: w.dorj.user.id }],
      openBlockers: 1,
    });
  });
});
