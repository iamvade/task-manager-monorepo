import {
  homeSchema,
  overviewReportSchema,
  sidebarResponseSchema,
  STATUS_CATEGORIES,
  workloadReportSchema,
} from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statuses, tasks } from '../src/db/schema/index.js';
import { ensureDefaultStatuses } from '../src/projects/statuses.js';
import { createTestApp } from './helpers.js';
import { timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

// Wednesday Oct 14 2026, 12:00 in Ulaanbaatar.
const NOW = new Date('2026-10-14T04:00:00Z');

describe('Backlog status', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 0 }, { now: () => NOW });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('is the first default status; older projects get it before To Do', async () => {
    const { project } = await taskWorld(ctx);
    expect(project.statuses.map((s) => s.category)).toEqual([...STATUS_CATEGORIES]);
    const backlog = project.statuses.find((s) => s.category === 'backlog');
    await ctx.db.delete(statuses).where(eq(statuses.id, backlog?.id ?? ''));

    expect(await ensureDefaultStatuses(ctx.db)).toBe(1);
    expect(await ensureDefaultStatuses(ctx.db)).toBe(0);
    const rows = await ctx.db
      .select({ category: statuses.category })
      .from(statuses)
      .where(eq(statuses.projectId, project.id))
      .orderBy(asc(statuses.position));
    expect(rows.map((r) => r.category)).toEqual([...STATUS_CATEGORIES]);
  });

  it('new tasks still start in To Do; a backlog task is open, not closed', async () => {
    const { status, createTask } = await taskWorld(ctx);
    const plain = await createTask({ title: 'Plain' });
    expect(plain.status.category).toBe('todo');
    const parked = await createTask({ title: 'Parked', statusId: status('backlog').id });
    const [row] = await ctx.db.select().from(tasks).where(eq(tasks.id, parked.id));
    expect([row?.completedAt, row?.closedAt]).toEqual([null, null]);
  });

  it('the views list it (open, filtered by category), My Tasks and the sidebar count do not', async () => {
    const { api, ws, owner, status, createTask, titles } = await taskWorld(ctx);
    const mine = { assigneeIds: [owner.id], dueDate: '2026-10-12' };
    await createTask({ title: 'Open', ...mine });
    await createTask({ title: 'Parked', statusId: status('backlog').id, ...mine });

    expect(await titles('?includeDone=false')).toEqual(['Parked', 'Open']);
    expect(await titles('?statusCategory=backlog')).toEqual(['Parked']);
    expect(
      await titles('?statusCategory=todo&statusCategory=in_progress&statusCategory=review'),
    ).toEqual(['Open']);

    const home = homeSchema.parse((await api('GET', `/me/home?workspaceId=${ws.id}`)).json());
    const sectionTitles = Object.values(home.sections).flatMap((s) => s.map((t) => t.title));
    expect(sectionTitles).toEqual(['Open']);
    const sidebar = sidebarResponseSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/sidebar`)).json(),
    );
    expect(sidebar.myTasksCount).toBe(1);
  });

  it('reports: backlog is left out of overdue and Workload', async () => {
    const { api, ws, owner, project } = await taskWorld(ctx);
    const base = { projectId: project.id, createdBy: owner.id, assigneeIds: [owner.id] };
    await timelineTask(ctx.db, {
      ...base,
      title: 'Late',
      size: 'S',
      dueDate: '2026-10-01',
      timeline: [['todo', '2026-09-20T01:00:00Z']],
    });
    await timelineTask(ctx.db, {
      ...base,
      title: 'Parked late',
      size: 'L',
      dueDate: '2026-10-01',
      timeline: [['backlog', '2026-09-20T01:00:00Z']],
    });

    const overview = overviewReportSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/reports/overview`)).json(),
    );
    expect(overview.overdue.count).toBe(1);
    expect(overview.waits.map((w) => w.category)).toEqual(['todo', 'in_progress', 'review']);

    const workload = workloadReportSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/reports/workload`)).json(),
    );
    const me = workload.people.find((p) => p.user.id === owner.id);
    expect(me?.openTasks).toBe(1);
    expect(me?.points).toBe(1);
  });
});
