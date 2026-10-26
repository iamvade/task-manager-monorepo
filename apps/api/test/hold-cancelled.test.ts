import {
  homeSchema,
  overviewReportSchema,
  sidebarResponseSchema,
  sprintsReportSchema,
  STATUS_CATEGORIES,
  taskDetailSchema,
  taskListItemSchema,
  workloadReportSchema,
} from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statuses, tasks } from '../src/db/schema/index.js';
import { completedBy } from '../src/feedback/events.js';
import { ensureDefaultStatuses } from '../src/projects/statuses.js';
import { createTestApp } from './helpers.js';
import { insertSprint, timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026, 12:00 in Ulaanbaatar.
const NOW = new Date('2026-10-14T04:00:00Z');

describe('On hold and Cancelled statuses', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('gives older projects the missing default statuses in category order, once', async () => {
    const { project } = await taskWorld(ctx);
    const onHold = project.statuses.find((s) => s.category === 'on_hold');
    const cancelled = project.statuses.find((s) => s.category === 'cancelled');
    await ctx.db.delete(statuses).where(eq(statuses.id, onHold?.id ?? ''));
    await ctx.db.delete(statuses).where(eq(statuses.id, cancelled?.id ?? ''));

    expect(await ensureDefaultStatuses(ctx.db)).toBe(2);
    expect(await ensureDefaultStatuses(ctx.db)).toBe(0);
    const rows = await ctx.db
      .select({ category: statuses.category, name: statuses.name })
      .from(statuses)
      .where(eq(statuses.projectId, project.id))
      .orderBy(asc(statuses.position));
    expect(rows.map((r) => r.category)).toEqual([...STATUS_CATEGORIES]);
    expect(rows.every((r) => r.name === null)).toBe(true);
  });

  it('stamps closed_at for done and cancelled, completed_at for done only', async () => {
    const { api, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'T' });
    const patch = async (category: Parameters<typeof status>[0]) => {
      const res = await api('PATCH', `/tasks/${task.id}`, { statusId: status(category).id });
      expect(res.statusCode, res.body).toBe(200);
      const [row] = await ctx.db.select().from(tasks).where(eq(tasks.id, task.id));
      return row;
    };

    const held = await patch('on_hold');
    expect([held?.completedAt, held?.closedAt]).toEqual([null, null]);
    const cancelled = await patch('cancelled');
    expect(cancelled?.completedAt).toBeNull();
    expect(cancelled?.closedAt).not.toBeNull();
    // Cancelled → Done: closed since cancelling, completed now.
    const done = await patch('done');
    expect(done?.completedAt).not.toBeNull();
    expect(done?.closedAt).toEqual(cancelled?.closedAt);
    const reopened = await patch('todo');
    expect([reopened?.completedAt, reopened?.closedAt]).toEqual([null, null]);

    const created = await createTask({ title: 'Born cancelled', statusId: status('cancelled').id });
    const [row] = await ctx.db.select().from(tasks).where(eq(tasks.id, created.id));
    expect(row?.completedAt).toBeNull();
    expect(row?.closedAt).not.toBeNull();
  });

  it('the checkbox completes a cancelled task and reopens back to On hold', async () => {
    const { api, status, createTask } = await taskWorld(ctx);
    const complete = async (id: string) => {
      const res = await api('POST', `/tasks/${id}/complete`);
      expect(res.statusCode, res.body).toBe(200);
      return taskListItemSchema.parse(res.json());
    };

    const cancelled = await createTask({ title: 'C', statusId: status('cancelled').id });
    expect((await complete(cancelled.id)).status.category).toBe('done');

    const held = await createTask({ title: 'H', statusId: status('on_hold').id });
    expect((await complete(held.id)).status.category).toBe('done');
    expect((await complete(held.id)).status.category).toBe('on_hold');
  });

  it('feedback "notify on done" fires on done only, not on cancel', async () => {
    const { api, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'T' });
    const seen: boolean[] = [];
    const off = ctx.app.events.on('task.updated', (e) => {
      if (e.taskId === task.id) seen.push(completedBy(e));
    });
    try {
      for (const category of ['cancelled', 'done'] as const) {
        await api('PATCH', `/tasks/${task.id}`, { statusId: status(category).id });
      }
    } finally {
      off();
    }
    expect(seen).toEqual([false, true]);
  });

  it('keeps the category when moving to another project', async () => {
    const { api, status, createTask, newProject } = await taskWorld(ctx);
    const other = await newProject('Other');
    const task = await createTask({ title: 'H', statusId: status('on_hold').id });
    const res = await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: other.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(taskDetailSchema.parse(res.json()).status.id).toBe(status('on_hold', other).id);
  });

  it('cancelled tasks leave open lists, My Tasks and the sidebar count; on hold stays', async () => {
    const { api, ws, owner, status, createTask, titles } = await taskWorld(ctx);
    const mine = { assigneeIds: [owner.id], dueDate: '2026-10-14' };
    await createTask({ title: 'Open', ...mine });
    await createTask({ title: 'Held', statusId: status('on_hold').id, ...mine });
    const gone = await createTask({
      title: 'Cancelled',
      statusId: status('cancelled').id,
      ...mine,
    });

    expect(await titles('?includeDone=false')).toEqual(['Open', 'Held']);
    expect(await titles('?doneSince=2026-10-01')).toEqual(['Open', 'Held', 'Cancelled']);
    await ctx.db
      .update(tasks)
      .set({ closedAt: new Date('2026-09-20T04:00:00Z') })
      .where(eq(tasks.id, gone.id));
    expect(await titles('?doneSince=2026-10-01')).toEqual(['Open', 'Held']);

    const home = homeSchema.parse((await api('GET', `/me/home?workspaceId=${ws.id}`)).json());
    expect(home.sections.today.map((t) => t.title).sort()).toEqual(['Held', 'Open']);
    const sidebar = sidebarResponseSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/sidebar`)).json(),
    );
    expect(sidebar.myTasksCount).toBe(2);
  });

  it('reports: cancelled is closed but never completed; on hold is open but not waiting', async () => {
    const { api, ws, owner, project } = await taskWorld(ctx);
    const base = { projectId: project.id, createdBy: owner.id, assigneeIds: [owner.id] };
    await timelineTask(ctx.db, {
      ...base,
      title: 'Cancelled',
      size: 'M',
      dueDate: '2026-10-01',
      timeline: [
        ['todo', '2026-09-20T01:00:00Z'],
        ['in_progress', '2026-09-22T01:00:00Z'],
        ['cancelled', '2026-10-05T01:00:00Z'],
      ],
    });
    await timelineTask(ctx.db, {
      ...base,
      title: 'Held',
      size: 'S',
      dueDate: '2026-10-01',
      timeline: [
        ['todo', '2026-09-20T01:00:00Z'],
        ['on_hold', '2026-09-25T01:00:00Z'],
        ['todo', '2026-09-28T01:00:00Z'],
        ['on_hold', '2026-09-30T01:00:00Z'],
      ],
    });

    const overview = overviewReportSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/reports/overview`)).json(),
    );
    expect(overview.completed.current.count).toBe(0);
    expect(overview.overdue.count).toBe(1);
    expect(overview.waits.map((w) => w.category)).toEqual(['todo', 'in_progress', 'review']);
    // Ended periods: Cancelled's To Do (2 d) and In Progress (13 d), Held's To Do (5 d, 2 d).
    expect(overview.waits.find((w) => w.category === 'todo')?.periods).toBe(3);
    expect(overview.aging.total).toBe(0);

    const workload = workloadReportSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/reports/workload`)).json(),
    );
    const me = workload.people.find((p) => p.user.id === owner.id);
    expect(me?.openTasks).toBe(1);
    expect(me?.points).toBe(1);
  });

  it('sprints: a cancelled task leaves the burndown and is not carried over', async () => {
    const { api, ws, owner, project } = await taskWorld(ctx);
    const s1 = await insertSprint(ctx.db, project.id, 1, '2026-09-28', '2026-10-09');
    const s2 = await insertSprint(ctx.db, project.id, 2, '2026-10-12', '2026-10-23');
    const base = { projectId: project.id, createdBy: owner.id };
    // Committed to sprint 2, cancelled Oct 13.
    await timelineTask(ctx.db, {
      ...base,
      title: 'Dropped',
      timeline: [
        ['todo', '2026-10-09T00:00:00Z'],
        ['cancelled', '2026-10-13T02:00:00Z'],
      ],
      sprints: [{ sprintId: s2.id, added: '2026-10-10T08:00:00Z' }],
    });
    // In sprint 1, cancelled before it ended, then put in sprint 2 anyway: not carried.
    await timelineTask(ctx.db, {
      ...base,
      title: 'Cancelled in 1',
      timeline: [
        ['todo', '2026-09-27T00:00:00Z'],
        ['cancelled', '2026-10-05T02:00:00Z'],
      ],
      sprints: [
        { sprintId: s1.id, added: '2026-09-26T08:00:00Z', removed: '2026-10-10T08:00:00Z' },
        { sprintId: s2.id, added: '2026-10-10T08:00:00Z' },
      ],
    });
    // Committed and still to do.
    await timelineTask(ctx.db, {
      ...base,
      title: 'Open',
      timeline: [['todo', '2026-10-09T00:00:00Z']],
      sprints: [{ sprintId: s2.id, added: '2026-10-10T08:00:00Z' }],
    });

    const res = await api('GET', `/workspaces/${ws.id}/reports/sprints?sprintId=${s2.id}`);
    expect(res.statusCode, res.body).toBe(200);
    const sprint = sprintsReportSchema.parse(res.json()).sprint;
    expect(sprint?.completed).toBe(0);
    // Start (Oct 12 00:00): Dropped + Open (Cancelled in 1 was already closed); Oct 13 end: Open.
    expect(sprint?.burndown.slice(0, 3).map((p) => p.remaining)).toEqual([2, 2, 1]);
    expect(sprint?.carried).toEqual([]);
    expect(sprint?.waitingMost).toBe('todo');
  });
});
