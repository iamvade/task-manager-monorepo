import {
  activityPageSchema,
  homeSchema,
  type CreateTask,
  type Home,
  type RichTextNode,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tasks } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

// Sunday 2026-10-11 18:00 UTC is already Monday Oct 12, 02:00 in Ulaanbaatar (UTC+8) but still
// Sunday Oct 11, 11:00 in Los Angeles (UTC-7): the same tasks fall into different sections and
// weeks depending on the user's time zone.
const NOW = new Date('2026-10-11T18:00:00Z');
const UB = 'Asia/Ulaanbaatar';
const LA = 'America/Los_Angeles';

const text = (...parts: (string | { id: string })[]): RichTextNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: parts.map((p) =>
        typeof p === 'string'
          ? { type: 'text', text: p }
          : { type: 'mention', attrs: { id: p.id, label: 'Anu' } },
      ),
    },
  ],
});

describe('GET /me/home', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const me = w.owner.id;
    const task = (title: string, extra: Omit<CreateTask, 'title'> = {}) =>
      w.createTask({ ...extra, title, assigneeIds: [me] });

    await task('Sat', { dueDate: '2026-10-10', priority: 'low' });
    await task('Sun', { dueDate: '2026-10-11', priority: 'high' });
    await task('Mon', { dueDate: '2026-10-12', priority: 'urgent' });
    await task('Next Sun', { dueDate: '2026-10-18' });
    await task('Next Mon low', { dueDate: '2026-10-19', priority: 'low' });
    await task('Next Mon urgent', { dueDate: '2026-10-19', priority: 'urgent' });
    await task('No due');
    // Someone else's task never shows.
    await w.createTask({ title: 'Not mine', dueDate: '2026-10-12' });

    // Done tasks, with completion instants around local midnights.
    const done = async (title: string, completedAt: string, dueDate: string | null = null) => {
      const t = await task(title, { dueDate, statusId: w.status('done').id });
      await ctx.db
        .update(tasks)
        .set({ completedAt: new Date(completedAt) })
        .where(eq(tasks.id, t.id));
    };
    await done('Done due Mon', '2026-09-01T00:00:00Z', '2026-10-12');
    await done('UB Mon 02:00 / LA Sun 11:00', '2026-10-04T18:00:00Z');
    await done('UB Tue 01:00 / LA Mon 10:00', '2026-10-05T17:00:00Z');
    await done('UB Sun 23:30 / LA Sun 08:30', '2026-10-11T15:30:00Z');
    await done('UB Mon 00:30 / LA Sun 09:30', '2026-10-11T16:30:00Z');

    const home = async (timezone: string): Promise<Home> => {
      const tz = await w.api('PATCH', '/me', { timezone });
      expect(tz.statusCode, tz.body).toBe(200);
      const res = await w.api('GET', `/me/home?workspaceId=${w.ws.id}`);
      expect(res.statusCode, res.body).toBe(200);
      return homeSchema.parse(res.json());
    };
    return { ...w, home };
  }

  const titles = (list: { title: string }[]) => list.map((t) => t.title);

  it('groups my tasks by due date in Ulaanbaatar', async () => {
    const { home, project } = await world();
    const h = await home(UB);
    expect(h).toMatchObject({ today: '2026-10-12', weekStart: '2026-10-12', timezone: UB });
    expect(titles(h.sections.overdue)).toEqual(['Sat', 'Sun']);
    expect(titles(h.sections.today)).toEqual(['Mon', 'Done due Mon']);
    expect(h.sections.today.map((t) => t.done)).toEqual([false, true]);
    expect(titles(h.sections.thisWeek)).toEqual(['Next Sun']);
    expect(titles(h.sections.later)).toEqual(['Next Mon urgent', 'Next Mon low', 'No due']);
    expect(h.sections.today[0]).toMatchObject({
      key: `${project.key}-3`,
      priority: 'urgent',
      status: { category: 'todo' },
      space: { initial: 'S', color: 'violet' },
    });

    expect(h.stats).toEqual({
      dueToday: { open: 1, total: 2, urgent: 1 },
      // Monday 00:30 local is this week; Sunday 23:30 is last week's.
      completedThisWeek: { count: 1, delta: 0, perDay: [1, 0, 0, 0, 0, 0, 0] },
      overdue: { count: 2, oldestDaysLate: 2 },
    });
  });

  it('groups the same tasks differently in Los Angeles', async () => {
    const { home } = await world();
    const h = await home(LA);
    expect(h).toMatchObject({ today: '2026-10-11', weekStart: '2026-10-05' });
    expect(titles(h.sections.overdue)).toEqual(['Sat']);
    expect(titles(h.sections.today)).toEqual(['Sun']);
    // Sunday: the week ends today, so tomorrow is already Later.
    expect(titles(h.sections.thisWeek)).toEqual([]);
    expect(titles(h.sections.later)).toEqual([
      'Mon',
      'Next Sun',
      'Next Mon urgent',
      'Next Mon low',
      'No due',
    ]);
    expect(h.stats).toEqual({
      dueToday: { open: 1, total: 1, urgent: 0 },
      // This week: Mon Oct 5 (1), Sun Oct 11 (2). Last week Mon→Sun: Sun Oct 4 (1).
      completedThisWeek: { count: 3, delta: 2, perDay: [1, 0, 0, 0, 0, 0, 2] },
      overdue: { count: 1, oldestDaysLate: 1 },
    });
  });

  it("shows others' activity on my tasks with unread flags", async () => {
    const w = await world();
    const sara = await w.person('member', 'Sara Khan');
    const [mine] = (await w.home(UB)).sections.today;
    if (!mine) throw new Error('no task');

    // My own change is left out; Sara's comment mentioning me is unread.
    await w.api('PATCH', `/tasks/${mine.id}`, { priority: 'high' });
    const res = await sara.api('POST', `/tasks/${mine.id}/comments`, {
      body: text('Ready for sign-off ', { id: w.owner.id }),
    });
    expect(res.statusCode, res.body).toBe(201);
    // A task I neither own nor follow stays out.
    const theirs = await sara.api('POST', `/projects/${w.project.id}/tasks`, { title: 'Theirs' });
    expect(theirs.statusCode).toBe(201);
    await ctx.app.events.idle();

    const feed = (await w.home(UB)).activity;
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      activity: { type: 'comment.added', actor: { id: sara.user.id } },
      task: { id: mine.id, key: mine.key },
      notificationType: 'mention',
      snippet: 'Ready for sign-off @Anu',
      unread: true,
    });

    await w.api('POST', '/me/notifications/read-all', { workspaceId: w.ws.id });
    expect((await w.home(UB)).activity.items[0]?.unread).toBe(false);
  });

  it('pages older activity', async () => {
    const w = await world();
    const sara = await w.person('member', 'Sara Khan');
    const [mine] = (await w.home(UB)).sections.later;
    for (const n of [1, 2, 3]) {
      await sara.api('POST', `/tasks/${mine?.id}/comments`, { body: text(`c${n}`) });
    }
    const page = async (query: string) => {
      const res = await w.api('GET', `/me/activity?workspaceId=${w.ws.id}&limit=2${query}`);
      expect(res.statusCode, res.body).toBe(200);
      return activityPageSchema.parse(res.json());
    };
    const p1 = await page('');
    expect(p1.items.map((i) => i.snippet)).toEqual(['c3', 'c2']);
    const p2 = await page(`&cursor=${p1.nextCursor}`);
    expect(p2.items.map((i) => i.snippet)).toEqual(['c1']);
    expect(p2.nextCursor).toBeNull();
  });

  it('is 404 outside my workspaces', async () => {
    const w = await world();
    const other = await taskWorld(ctx, 'Outsider');
    for (const path of ['/me/home', '/me/activity']) {
      const res = await other.api('GET', `${path}?workspaceId=${w.ws.id}`);
      expect(res.statusCode).toBe(404);
    }
  });
});
