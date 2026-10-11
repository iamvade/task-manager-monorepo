import { readFileSync } from 'node:fs';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MN_PUBLIC_HOLIDAYS_2026 } from '../src/db/holidays.js';
import { activity, sprintMemberships, taskStatusPeriods } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

// drizzle/0006 rebuilds status periods and sprint memberships from the activity log for tasks
// that have none. The functions stay installed; these tests rerun them on crafted history.

describe('report data backfill', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rebuilds a status chain from task.created and status.changed rows, idempotently', async () => {
    const { api, owner, person, project, newProject, status, createTask } = await taskWorld(ctx);
    const bat = await person('member', 'Bat O.');
    const task = await createTask({ title: 'History', statusId: status('in_progress').id });
    // Move it away so its last logged status differs from the current one.
    const other = await newProject('Other');
    await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: other.id });

    const at = (iso: string) => new Date(iso);
    const snap = (category: 'todo' | 'in_progress' | 'review', p = project) => ({
      id: status(category, p).id,
      name: null,
      category,
    });

    const result = await ctx.db.transaction(async (tx) => {
      // Pretend the task predates the periods table: drop its periods and rewrite its history.
      await tx.delete(taskStatusPeriods).where(eq(taskStatusPeriods.taskId, task.id));
      await tx.delete(activity).where(eq(activity.taskId, task.id));
      const base = { workspaceId: project.workspaceId, projectId: other.id, taskId: task.id };
      await tx.insert(activity).values([
        {
          ...base,
          actorId: owner.id,
          type: 'task.created',
          payload: { status: snap('todo') },
          createdAt: at('2026-09-01T02:00:00Z'),
        },
        {
          ...base,
          actorId: bat.user.id,
          type: 'status.changed',
          payload: { from: snap('todo'), to: snap('in_progress') },
          createdAt: at('2026-09-02T02:00:00Z'),
        },
        {
          ...base,
          actorId: bat.user.id,
          type: 'status.changed',
          payload: { from: snap('in_progress'), to: snap('review') },
          createdAt: at('2026-09-04T02:00:00Z'),
        },
        {
          ...base,
          actorId: owner.id,
          type: 'project.changed',
          payload: {},
          createdAt: at('2026-09-05T02:00:00Z'),
        },
      ]);
      const [first] = await tx
        .execute<{ n: number }>(sql`select kite_backfill_status_periods() as n`)
        .then((r) => r.rows);
      const [second] = await tx
        .execute<{ n: number }>(sql`select kite_backfill_status_periods() as n`)
        .then((r) => r.rows);
      const rows = await tx
        .select()
        .from(taskStatusPeriods)
        .where(eq(taskStatusPeriods.taskId, task.id))
        .orderBy(asc(taskStatusPeriods.enteredAt));
      return { first: first?.n, second: second?.n, rows };
    });

    expect(result.first).toBe(4);
    expect(result.second).toBe(0);
    expect(
      result.rows.map((p) => [
        p.category,
        p.statusId,
        p.enteredAt.toISOString(),
        p.exitedAt?.toISOString() ?? null,
        p.enteredBy,
      ]),
    ).toEqual([
      ['todo', status('todo').id, '2026-09-01T02:00:00.000Z', '2026-09-02T02:00:00.000Z', owner.id],
      [
        'in_progress',
        status('in_progress').id,
        '2026-09-02T02:00:00.000Z',
        '2026-09-04T02:00:00.000Z',
        bat.user.id,
      ],
      [
        'review',
        status('review').id,
        '2026-09-04T02:00:00.000Z',
        '2026-09-05T02:00:00.000Z',
        bat.user.id,
      ],
      // The move to `other` only logged project.changed: closed there, current status opened.
      ['in_progress', status('in_progress', other).id, '2026-09-05T02:00:00.000Z', null, owner.id],
    ]);
  });

  it('gives a task without history one period at creation', async () => {
    const { createTask, status } = await taskWorld(ctx);
    const task = await createTask({ title: 'Quiet' });
    const rows = await ctx.db.transaction(async (tx) => {
      await tx.delete(taskStatusPeriods).where(eq(taskStatusPeriods.taskId, task.id));
      await tx.delete(activity).where(eq(activity.taskId, task.id));
      await tx.execute(sql`select kite_backfill_status_periods()`);
      return tx.select().from(taskStatusPeriods).where(eq(taskStatusPeriods.taskId, task.id));
    });
    expect(rows).toMatchObject([
      { statusId: status('todo').id, enteredAt: new Date(task.createdAt), exitedAt: null },
    ]);
  });

  it('opens missing sprint memberships at the last sprint.changed', async () => {
    const { api, project, createTask } = await taskWorld(ctx);
    const sprint = (
      await api('POST', `/projects/${project.id}/sprints`, {
        startDate: '2026-10-06',
        endDate: '2026-10-24',
      })
    ).json<{ id: string }>();
    const task = await createTask({ title: 'In sprint', sprintId: sprint.id });
    const [before] = await ctx.db
      .select()
      .from(sprintMemberships)
      .where(eq(sprintMemberships.taskId, task.id));
    const rows = await ctx.db.transaction(async (tx) => {
      await tx.delete(sprintMemberships).where(eq(sprintMemberships.taskId, task.id));
      await tx.execute(sql`select kite_backfill_sprint_memberships()`);
      return tx.select().from(sprintMemberships).where(eq(sprintMemberships.taskId, task.id));
    });
    expect(rows).toMatchObject([
      { sprintId: sprint.id, addedAt: before?.addedAt, removedAt: null },
    ]);
  });

  it('inserts the same holidays as src/db/holidays.ts', () => {
    const migration = readFileSync(
      new URL('../drizzle/0006_report_backfill.sql', import.meta.url),
      'utf8',
    );
    const inSql = [...migration.matchAll(/\('(\d{4}-\d{2}-\d{2})'::date, '([^']+)'\)/g)].map(
      ([, date, name]) => ({ date, name }),
    );
    expect(inSql).toEqual(MN_PUBLIC_HOLIDAYS_2026);
  });
});
