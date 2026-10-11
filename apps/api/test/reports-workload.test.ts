import { workloadReportSchema, type Size } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026 in Ulaanbaatar: overdue < Oct 14, this week = Oct 14 → Sunday Oct 18.
const NOW = new Date('2026-10-14T04:00:00Z');

describe('GET /workspaces/:id/reports/workload', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const heavy = await w.person('member', 'Heavy Cap10');
    const balanced = await w.person('member', 'Balanced');
    const late = await w.person('member', 'Late');
    const idle = await w.person('member', 'Idle');
    const setCapacity = async (userId: string, capacityPoints: number) => {
      const res = await w.api('PATCH', `/workspaces/${w.ws.id}/members/${userId}`, {
        capacityPoints,
      });
      expect(res.statusCode, res.body).toBe(200);
    };
    await setCapacity(heavy.user.id, 10);

    const open = (assigneeIds: string[], size: Size | null, dueDate: string | null) =>
      timelineTask(ctx.db, {
        projectId: w.project.id,
        createdBy: w.owner.id,
        assigneeIds,
        size,
        dueDate,
        timeline: [['todo', '2026-10-01T00:00:00Z']],
      });
    // Capacity 10: 13 points > 12 → Heavy. Today and Sunday are "this week".
    await open([heavy.user.id], 'XL', '2026-10-14');
    await open([heavy.user.id], 'L', '2026-10-18');
    // Capacity 15: 18 points, not above 18 → Balanced. Monday is "later".
    await open([balanced.user.id], 'XL', '2026-10-19');
    await open([balanced.user.id], 'XL', null);
    await open([balanced.user.id], 'S', '2026-10-30');
    // Shared with the owner: counts fully for both.
    await open([balanced.user.id, w.owner.id], 'S', null);
    // 5 overdue points → Heavy even with little work.
    await open([late.user.id], 'L', '2026-10-13');
    // Done tasks don't count.
    await timelineTask(ctx.db, {
      projectId: w.project.id,
      createdBy: w.owner.id,
      assigneeIds: [heavy.user.id],
      size: 'XL',
      dueDate: '2026-10-13',
      timeline: [['done', '2026-10-10T00:00:00Z']],
    });
    return { w, heavy, balanced, late, idle };
  }

  it('buckets open points by due date and applies Heavy / Balanced / Light', async () => {
    const { w, heavy, balanced, late, idle } = await world();
    const res = await w.api('GET', `/workspaces/${w.ws.id}/reports/workload`);
    expect(res.statusCode, res.body).toBe(200);
    const r = workloadReportSchema.parse(res.json());
    expect(r.weekEnd).toBe('2026-10-18');
    const row = (id: string) => r.people.find((p) => p.user.id === id);

    expect(row(heavy.user.id)).toMatchObject({
      capacity: 10,
      openTasks: 2,
      points: 13,
      load: 'heavy',
      buckets: {
        overdue: { points: 0, tasks: 0 },
        week: { points: 13, tasks: 2 },
        later: { points: 0, tasks: 0 },
        none: { points: 0, tasks: 0 },
      },
    });
    expect(row(balanced.user.id)).toMatchObject({
      capacity: 15,
      openTasks: 4,
      points: 18,
      load: 'balanced',
      buckets: { later: { points: 9, tasks: 2 }, none: { points: 9, tasks: 2 } },
    });
    expect(row(late.user.id)).toMatchObject({
      points: 5,
      load: 'heavy',
      buckets: { overdue: { points: 5, tasks: 1 } },
    });
    expect(row(idle.user.id)).toMatchObject({ points: 0, openTasks: 0, load: 'light', tasks: [] });
    expect(row(w.owner.id)).toMatchObject({ points: 1, load: 'light' });

    // Tasks by bucket, then due date.
    expect(row(balanced.user.id)?.tasks.map((t) => [t.bucket, t.dueDate])).toEqual([
      ['later', '2026-10-19'],
      ['later', '2026-10-30'],
      ['none', null],
      ['none', null],
    ]);
    // People by open points; totals count the shared task once.
    expect(r.people[0]?.user.id).toBe(balanced.user.id);
    expect(r.totals).toEqual({ openTasks: 7, points: 36 });
  });

  it('with a project filter lists its team and anyone with open tasks there', async () => {
    const { w, heavy, idle } = await world();
    const res = await w.api(
      'GET',
      `/workspaces/${w.ws.id}/reports/workload?projectId=${w.project.id}`,
    );
    const r = workloadReportSchema.parse(res.json());
    const ids = r.people.map((p) => p.user.id);
    expect(ids).toContain(heavy.user.id);
    // The owner created the project, so they are on its team.
    expect(ids).toContain(w.owner.id);
    expect(ids).not.toContain(idle.user.id);
  });

  it('exports one row per person as CSV', async () => {
    const { w } = await world();
    const res = await w.api('GET', `/workspaces/${w.ws.id}/reports/workload.csv`);
    expect(res.statusCode).toBe(200);
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'Гишүүн,Албан тушаал,Нээлттэй ажил,Оноо,Хугацаа хэтэрсэн,Энэ долоо хоногт,Дараа,Огноогүй,Багтаамж,Ачаалал',
    );
    expect(lines).toHaveLength(6);
    expect(lines.find((l) => l.startsWith('Heavy Cap10'))).toBe(
      'Heavy Cap10,,2,13,0,13,0,0,10,Ачаалал их',
    );
  });
});
