import { overviewReportSchema, type OverviewReport } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026, 12:00 in Ulaanbaatar (UTC+8). "4w" = Sep 17 – Oct 14, the previous
// period Aug 20 – Sep 16; the current week started Monday Oct 12.
const NOW = new Date('2026-10-14T04:00:00Z');

describe('GET /workspaces/:id/reports/overview', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const base = { projectId: w.project.id, createdBy: w.owner.id };
    const task = (input: Omit<Parameters<typeof timelineTask>[1], keyof typeof base>) =>
      timelineTask(ctx.db, { ...base, ...input });

    // Reopened: first In Progress Oct 2, done Oct 3, reopened Oct 5, done again Oct 6 → 4.0 days.
    await task({
      size: 'S',
      timeline: [
        ['todo', '2026-10-01T01:00:00Z'],
        ['in_progress', '2026-10-02T01:00:00Z'],
        ['done', '2026-10-03T01:00:00Z'],
        ['in_progress', '2026-10-05T01:00:00Z'],
        ['done', '2026-10-06T01:00:00Z'],
      ],
    });
    // Due Oct 13, done 23:30 on Oct 13 in Ulaanbaatar → on time (1.0 day).
    await task({
      size: 'M',
      dueDate: '2026-10-13',
      timeline: [
        ['todo', '2026-10-10T01:00:00Z'],
        ['in_progress', '2026-10-12T15:30:00Z'],
        ['done', '2026-10-13T15:30:00Z'],
      ],
    });
    // Due Oct 13, done 00:30 on Oct 14 in Ulaanbaatar (still Oct 13 in UTC) → late.
    await task({
      size: 'XL',
      dueDate: '2026-10-13',
      timeline: [
        ['todo', '2026-10-10T01:00:00Z'],
        ['in_progress', '2026-10-12T16:30:00Z'],
        ['done', '2026-10-13T16:30:00Z'],
      ],
    });
    // Done Sunday Oct 11 23:30 in Ulaanbaatar → the week of Oct 5 (2.0 days).
    await task({
      size: 'L',
      timeline: [
        ['in_progress', '2026-10-09T15:30:00Z'],
        ['done', '2026-10-11T15:30:00Z'],
      ],
    });
    // Done Monday Oct 12 00:30 in Ulaanbaatar (Sunday in UTC) → the week of Oct 12; unsized.
    await task({
      timeline: [
        ['in_progress', '2026-10-10T16:30:00Z'],
        ['done', '2026-10-11T16:30:00Z'],
      ],
    });
    // Two days in review, 3.0 days of cycle; unsized.
    await task({
      timeline: [
        ['in_progress', '2026-10-07T00:00:00Z'],
        ['review', '2026-10-08T00:00:00Z'],
        ['done', '2026-10-10T00:00:00Z'],
      ],
    });
    // Previous period.
    await task({
      size: 'M',
      dueDate: '2026-08-31',
      timeline: [
        ['in_progress', '2026-08-30T00:00:00Z'],
        ['done', '2026-09-01T00:00:00Z'],
      ],
    });
    // Open: To Do since Oct 1 (13 days, stale) and due Oct 10 (4 days late); since Oct 9
    // (5 days, not stale yet); In Progress since Oct 8 (6 days, stale).
    await task({ dueDate: '2026-10-10', timeline: [['todo', '2026-10-01T02:00:00Z']] });
    await task({ timeline: [['todo', '2026-10-09T04:00:00Z']] });
    await task({
      timeline: [
        ['todo', '2026-10-07T04:00:00Z'],
        ['in_progress', '2026-10-08T04:00:00Z'],
      ],
    });
    return w;
  }

  async function overview(w: Awaited<ReturnType<typeof taskWorld>>, query = '') {
    const res = await w.api('GET', `/workspaces/${w.ws.id}/reports/overview${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return overviewReportSchema.parse(res.json());
  }

  let report: OverviewReport;
  beforeAll(async () => {
    report = await overview(await world());
  });

  it('reports the period and the previous one', () => {
    expect(report.today).toBe('2026-10-14');
    expect(report.range).toEqual({ from: '2026-09-17', to: '2026-10-14' });
    expect(report.previousRange).toEqual({ from: '2026-08-20', to: '2026-09-16' });
    expect(report.history).toEqual({ completed: 7, required: 5 });
  });

  it('counts completions and points', () => {
    expect(report.completed.current).toEqual({ count: 6, points: 17, unsized: 2 });
    expect(report.completed.previous).toEqual({ count: 1, points: 3, unsized: 0 });
  });

  it('measures cycle time from the first In Progress, through reopens, to the last done', () => {
    // Cycles 4 (reopened), 1, 1, 2, 1, 3 → median 1.5, p85 3.25.
    expect(report.cycleTime.current).toEqual({ median: 1.5, p85: 3.3, count: 6 });
    expect(report.cycleTime.previous.median).toBe(2);
  });

  it('on time = done on or before the due date in the user’s time zone; no due date excluded', () => {
    expect(report.onTime.current).toEqual({ onTime: 1, total: 2 });
    expect(report.onTime.previous).toEqual({ onTime: 0, total: 1 });
  });

  it('buckets throughput by Monday weeks in Asia/Ulaanbaatar and flags the current week', () => {
    const weeks = report.throughput.weeks;
    expect(weeks).toHaveLength(12);
    expect(report.throughput.previous).toHaveLength(12);
    expect(weeks.at(-1)).toEqual({ weekStart: '2026-10-12', count: 3, partial: true });
    expect(weeks.at(-2)).toEqual({ weekStart: '2026-10-05', count: 3, partial: false });
    expect(weeks[0]?.weekStart).toBe('2026-07-27');
    expect(report.throughput.previous.at(-1)?.weekStart).toBe('2026-07-20');
    expect(weeks.filter((w) => w.partial)).toHaveLength(1);
  });

  it('medians the status periods that ended in the period', () => {
    const review = report.waits.find((w) => w.category === 'review');
    expect(review).toEqual({ category: 'review', medianDays: 2, periods: 1 });
    expect(report.waits.map((w) => w.category)).toEqual(['todo', 'in_progress', 'review']);
  });

  it('snapshots overdue tasks', () => {
    expect(report.overdue).toEqual({ count: 1, oldestDaysLate: 4 });
  });

  it('lists aging tasks by days in status, stale after 5 days', () => {
    expect(report.aging.total).toBe(3);
    expect(report.aging.staleCount).toBe(2);
    expect(report.aging.tasks.map((t) => [t.daysInStatus, t.stale])).toEqual([
      [13, true],
      [6, true],
      [5, false],
    ]);
    expect(report.aging.tasks[0]?.status.category).toBe('todo');
  });

  it('a new project shows "1 / 5"', async () => {
    const w = await taskWorld(ctx);
    const fresh = await w.newProject('Partner Portal');
    await timelineTask(ctx.db, {
      projectId: fresh.id,
      createdBy: w.owner.id,
      timeline: [['done', '2026-10-13T00:00:00Z']],
    });
    const r = await overview(w, `?projectId=${fresh.id}`);
    expect(r.history).toEqual({ completed: 1, required: 5 });
    expect(r.scope).toEqual({ workspaceId: w.ws.id, spaceId: null, projectId: fresh.id });
  });

  it('this week runs Monday → today, compared with as many days before', async () => {
    const w = await taskWorld(ctx);
    const r = await overview(w, '?period=week');
    expect(r.range).toEqual({ from: '2026-10-12', to: '2026-10-14' });
    expect(r.previousRange).toEqual({ from: '2026-10-09', to: '2026-10-11' });
  });

  it('rejects a custom period without dates', async () => {
    const w = await taskWorld(ctx);
    const res = await w.api('GET', `/workspaces/${w.ws.id}/reports/overview?period=custom`);
    expect(res.statusCode).toBe(400);
  });
});
