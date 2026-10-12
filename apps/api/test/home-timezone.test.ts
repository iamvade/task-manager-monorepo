import { homeSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tasks } from '../src/db/schema/index.js';
import { apiClient } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

// Ulaanbaatar is UTC+8 all year: local midnight of Oct 12 is 2026-10-11T16:00:00Z.
const UB_MIDNIGHT = new Date('2026-10-11T16:00:00Z');
const JUST_BEFORE = new Date(UB_MIDNIGHT.getTime() - 1);

describe('My Tasks grouping around local midnight', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let now = JUST_BEFORE;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: () => now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const mine = (title: string, dueDate: string | null) =>
      w.createTask({ title, dueDate, assigneeIds: [w.owner.id] });
    await mine('Due Sun 11', '2026-10-11');
    await mine('Due Mon 12', '2026-10-12');
    await mine('Due Sun 18', '2026-10-18');
    await mine('Due Mon 19', '2026-10-19');
    const done = await w.createTask({
      title: 'Done at midnight',
      assigneeIds: [w.owner.id],
      statusId: w.status('done').id,
    });
    await ctx.db.update(tasks).set({ completedAt: UB_MIDNIGHT }).where(eq(tasks.id, done.id));
    const home = async () => {
      const res = await w.api('GET', `/me/home?workspaceId=${w.ws.id}`);
      expect(res.statusCode, res.body).toBe(200);
      return homeSchema.parse(res.json());
    };
    return { ...w, home };
  }
  const titles = (list: { title: string }[]) => list.map((t) => t.title);

  it('uses Ulaanbaatar for a user who never picked a time zone', async () => {
    now = JUST_BEFORE;
    const { home } = await world();
    expect((await home()).timezone).toBe('Asia/Ulaanbaatar');
  });

  it('keeps a task in Today until the last millisecond of the local day', async () => {
    now = JUST_BEFORE;
    const { home } = await world();
    const h = await home();
    expect(h.today).toBe('2026-10-11');
    expect(titles(h.sections.overdue)).toEqual([]);
    expect(titles(h.sections.today)).toEqual(['Due Sun 11']);
    // Sunday is the last day of the week: Monday onwards is Later.
    expect(titles(h.sections.thisWeek)).toEqual([]);
    expect(titles(h.sections.later)).toEqual(['Due Mon 12', 'Due Sun 18', 'Due Mon 19']);
    expect(h.stats.overdue).toEqual({ count: 0, oldestDaysLate: null });
  });

  it('flips it to Overdue at local midnight and starts a new week', async () => {
    now = UB_MIDNIGHT;
    const { home } = await world();
    const h = await home();
    expect(h).toMatchObject({ today: '2026-10-12', weekStart: '2026-10-12' });
    expect(titles(h.sections.overdue)).toEqual(['Due Sun 11']);
    expect(titles(h.sections.today)).toEqual(['Due Mon 12']);
    // Sunday the 18th closes this week; Monday the 19th is next week.
    expect(titles(h.sections.thisWeek)).toEqual(['Due Sun 18']);
    expect(titles(h.sections.later)).toEqual(['Due Mon 19']);
    expect(h.stats.overdue).toEqual({ count: 1, oldestDaysLate: 1 });
    // Completed exactly at 00:00 local counts on Monday, the first day of the new week.
    expect(h.stats.completedThisWeek.perDay).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it('requires a session', async () => {
    now = JUST_BEFORE;
    const { ws } = await world();
    const res = await apiClient(ctx.app)('GET', `/me/home?workspaceId=${ws.id}`);
    expect(res.statusCode).toBe(401);
  });
});
