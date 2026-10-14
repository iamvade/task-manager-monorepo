import { personReportSchema, type PersonReport } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { insertActivity, insertComment, timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026, 12:00 in Ulaanbaatar; "4w" = Sep 17 – Oct 14.
const NOW = new Date('2026-10-14T04:00:00Z');

describe('GET /workspaces/:id/reports/people/:userId', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const u = await w.person('member', 'Ulzii B.');
    const other = await w.person('member', 'Other P.');
    const owner = w.owner.id;
    const me = u.user.id;
    const base = { projectId: w.project.id, createdBy: owner };
    const log = (
      taskId: string,
      actorId: string,
      type: 'assignee.added' | 'assignee.removed' | 'subtask.completed',
      createdAt: string,
      payload: Record<string, unknown>,
    ) =>
      insertActivity(ctx.db, {
        workspaceId: w.ws.id,
        projectId: w.project.id,
        taskId,
        actorId,
        type,
        payload,
        createdAt,
      });

    // The owner's open tasks, where the person helps.
    const x = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        timelineTask(ctx.db, {
          ...base,
          title: `X${i}`,
          assigneeIds: [owner],
          timeline: [['todo', '2026-09-20T00:00:00Z']],
        }),
      ),
    );
    const [x1, x2, x3, x4] = x as [(typeof x)[0], (typeof x)[0], (typeof x)[0], (typeof x)[0]];
    // Mentioned Oct 5 10:00, answered 2h later.
    await insertComment(ctx.db, x1.id, owner, '2026-10-05T10:00:00Z', me);
    await insertComment(ctx.db, x1.id, me, '2026-10-05T12:00:00Z');
    // Mentioned Oct 1, answered only 8 days later: not answered.
    await insertComment(ctx.db, x2.id, owner, '2026-10-01T00:00:00Z', me);
    await insertComment(ctx.db, x2.id, me, '2026-10-09T01:00:00Z');
    // Mentioned Oct 10, someone else replied: not answered.
    await insertComment(ctx.db, x3.id, owner, '2026-10-10T00:00:00Z', me);
    await insertComment(ctx.db, x3.id, other.user.id, '2026-10-10T01:00:00Z');
    // Mentioned Oct 12, answered 4h later.
    await insertComment(ctx.db, x4.id, owner, '2026-10-12T00:00:00Z', me);
    await insertComment(ctx.db, x4.id, me, '2026-10-12T04:00:00Z');
    // A subtask checked off on the owner's task.
    await log(x1.id, me, 'subtask.completed', '2026-10-06T00:00:00Z', {
      subtask: { id: x1.id, title: 'QA' },
    });

    // Reviews: as reviewer (2 days), by moving it out with no reviewer (1 day); a task with
    // another reviewer counts for them, not for whoever moved it.
    await timelineTask(ctx.db, {
      ...base,
      assigneeIds: [owner],
      reviewerId: me,
      timeline: [
        ['in_progress', '2026-10-05T00:00:00Z'],
        ['review', '2026-10-06T00:00:00Z'],
        ['done', '2026-10-08T00:00:00Z'],
      ],
    });
    await timelineTask(ctx.db, {
      ...base,
      assigneeIds: [owner],
      exitedBy: [undefined, me],
      timeline: [
        ['in_progress', '2026-10-08T00:00:00Z'],
        ['review', '2026-10-09T00:00:00Z'],
        ['done', '2026-10-10T00:00:00Z'],
      ],
    });
    await timelineTask(ctx.db, {
      ...base,
      assigneeIds: [owner],
      reviewerId: owner,
      exitedBy: [undefined, me],
      timeline: [
        ['in_progress', '2026-10-08T00:00:00Z'],
        ['review', '2026-10-09T00:00:00Z'],
        ['done', '2026-10-11T00:00:00Z'],
      ],
    });

    // Completions credited to whoever was assigned at completion.
    await timelineTask(ctx.db, {
      ...base,
      title: 'mine now',
      size: 'M',
      dueDate: '2026-10-07',
      assigneeIds: [me],
      timeline: [
        ['in_progress', '2026-10-05T00:00:00Z'],
        ['done', '2026-10-07T00:00:00Z'],
      ],
    });
    const handedOver = await timelineTask(ctx.db, {
      ...base,
      title: 'unassigned after done',
      size: 'S',
      assigneeIds: [owner],
      timeline: [
        ['in_progress', '2026-10-06T00:00:00Z'],
        ['done', '2026-10-08T00:00:00Z'],
      ],
    });
    await log(handedOver.id, owner, 'assignee.removed', '2026-10-09T00:00:00Z', {
      user: { id: me, name: 'Ulzii B.' },
    });
    const takenLater = await timelineTask(ctx.db, {
      ...base,
      title: 'assigned after done',
      assigneeIds: [me],
      timeline: [
        ['in_progress', '2026-10-06T00:00:00Z'],
        ['done', '2026-10-08T00:00:00Z'],
      ],
    });
    await log(takenLater.id, owner, 'assignee.added', '2026-10-09T00:00:00Z', {
      user: { id: me, name: 'Ulzii B.' },
    });
    // Open and overdue, 3 days late.
    await timelineTask(ctx.db, {
      ...base,
      assigneeIds: [me],
      dueDate: '2026-10-11',
      timeline: [['todo', '2026-10-01T00:00:00Z']],
    });
    return { w, u, other };
  }

  let fx: Awaited<ReturnType<typeof world>>;
  let report: PersonReport;
  beforeAll(async () => {
    fx = await world();
    const res = await fx.u.api('GET', `/workspaces/${fx.w.ws.id}/reports/people/me`);
    expect(res.statusCode, res.body).toBe(200);
    report = personReportSchema.parse(res.json());
  });

  it('describes the person', () => {
    expect(report.person.user.id).toBe(fx.u.user.id);
    expect(report.person.role).toBe('member');
  });

  it('credits completions to whoever was assigned when the task was completed', () => {
    expect(report.completed.current).toEqual({ count: 2, points: 4, unsized: 0 });
    expect(report.onTime.current).toEqual({ onTime: 1, total: 1 });
    expect(report.cycleTime.current.median).toBe(2);
  });

  it('counts overdue open tasks', () => {
    expect(report.overdue).toEqual({ count: 1, oldestDaysLate: 3 });
    expect(report.openTasks).toHaveLength(1);
  });

  it('credits review periods to the reviewer, else to whoever moved the task out', () => {
    expect(report.reviews.current).toEqual({ medianDays: 1.5, count: 2 });
  });

  it('counts mentions answered within 7 days and the median reply time', () => {
    expect(report.helping.mentions).toEqual({ answered: 2, total: 4, medianReplyHours: 3 });
  });

  it('counts helping on others’ tasks and who the person worked with', () => {
    expect(report.helping.comments.current).toBe(3);
    expect(report.helping.subtasks).toEqual({ count: 1, tasks: 1 });
    // 3 comments + 1 subtask on the owner's tasks; nothing with the other member.
    expect(report.helping.workedWith).toEqual([
      { user: expect.objectContaining({ id: fx.w.owner.id }) as unknown, count: 4 },
    ]);
  });

  it('returns 12 trend weeks with team medians', () => {
    expect(report.trends.weeks).toHaveLength(12);
    expect(report.trends.weeks.at(-1)).toMatchObject({ weekStart: '2026-10-12', partial: true });
    expect(report.trends.weeks.at(-2)).toMatchObject({ weekStart: '2026-10-05', completed: 2 });
    expect(report.trends.teamCompletedMedian).not.toBeNull();
    expect(report.trends.teamCycleMedian).not.toBeNull();
  });

  it('lists the person’s completed tasks in the report, latest first', async () => {
    const res = await fx.u.api('GET', `/workspaces/${fx.w.ws.id}/reports/people/me`);
    expect(res.statusCode, res.body).toBe(200);
    const report = personReportSchema.parse(res.json());
    expect(report.completedTasks).toHaveLength(report.completed.current.count);
    const times = report.completedTasks.map((t) => t.completedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(report.completedTasks.some((t) => t.title === 'mine now')).toBe(true);
    expect(report.completedTasks[0]).toMatchObject({ cycleDays: expect.any(Number) as number });
  });

  it('exports the person’s completed tasks', async () => {
    const res = await fx.u.api('GET', `/workspaces/${fx.w.ws.id}/reports/people/me.csv`);
    expect(res.statusCode, res.body).toBe(200);
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('mine now');
    expect(lines[1]).toMatch(/,2026-10-07 08:00,2$/);
  });
});
