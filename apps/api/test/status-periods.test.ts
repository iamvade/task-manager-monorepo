import { taskDetailSchema } from '@kite/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sprintMemberships, taskStatusPeriods, tasks } from '../src/db/schema/index.js';
import { insertTask } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

// The guard: every status change writes a status period in the same transaction. The deferred
// trigger in drizzle/0006 makes any path that skips tasks/status.ts fail at commit, here and in
// every other test that changes a status.

describe('status periods and sprint memberships', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const periods = (taskId: string) =>
    ctx.db
      .select()
      .from(taskStatusPeriods)
      .where(eq(taskStatusPeriods.taskId, taskId))
      .orderBy(asc(taskStatusPeriods.enteredAt), asc(taskStatusPeriods.id));

  const memberships = (taskId: string) =>
    ctx.db
      .select()
      .from(sprintMemberships)
      .where(eq(sprintMemberships.taskId, taskId))
      .orderBy(asc(sprintMemberships.addedAt), asc(sprintMemberships.id));

  /** One open period matching the task's status; each period ends where the next begins. */
  async function expectChain(taskId: string) {
    const [task] = await ctx.db.select().from(tasks).where(eq(tasks.id, taskId));
    const rows = await periods(taskId);
    expect(rows.filter((p) => p.exitedAt === null)).toHaveLength(1);
    const last = rows.at(-1);
    expect(last?.exitedAt).toBeNull();
    expect(last?.statusId).toBe(task?.statusId);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]?.exitedAt).toEqual(rows[i]?.enteredAt);
      expect(rows[i - 1]?.exitedBy).toBe(rows[i]?.enteredBy);
    }
    return rows;
  }

  it('rejects a status change without a status period at commit', async () => {
    const { project, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Sneaky' });
    const raw = ctx.db
      .update(tasks)
      .set({ statusId: status('done').id })
      .where(eq(tasks.id, task.id));
    await expect(raw).rejects.toMatchObject({ cause: { code: '23514' } });

    const insert = ctx.db.insert(tasks).values({
      projectId: project.id,
      number: 999,
      statusId: status('todo').id,
      title: 'No period',
      position: 'zz',
      createdBy: task.creator.id,
    });
    await expect(insert).rejects.toMatchObject({ cause: { code: '23514' } });
    // The fixture that writes the period is accepted.
    await expect(
      insertTask(ctx.db, {
        projectId: project.id,
        number: 1000,
        statusId: status('todo').id,
        title: 'With period',
        position: 'zz',
        createdBy: task.creator.id,
      }),
    ).resolves.toMatchObject({ title: 'With period' });
  });

  it('rejects a sprint change without a membership at commit', async () => {
    const { api, project, createTask } = await taskWorld(ctx);
    const sprint = (
      await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
        projectIds: [project.id],
        startDate: '2026-10-06',
        endDate: '2026-10-24',
      })
    ).json<{ id: string }>();
    const task = await createTask({ title: 'T' });
    const raw = ctx.db.update(tasks).set({ sprintId: sprint.id }).where(eq(tasks.id, task.id));
    await expect(raw).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('opens a period on create and switches it on PATCH, move and complete/reopen', async () => {
    const { api, owner, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Flow', statusId: status('in_progress').id });
    expect(await expectChain(task.id)).toMatchObject([
      { category: 'in_progress', enteredBy: owner.id },
    ]);

    let res = await api('PATCH', `/tasks/${task.id}`, { statusId: status('review').id });
    expect(res.statusCode, res.body).toBe(200);
    res = await api('POST', `/tasks/${task.id}/move`, { statusId: status('in_progress').id });
    expect(res.statusCode, res.body).toBe(200);
    // A pure reorder writes no period.
    res = await api('POST', `/tasks/${task.id}/move`, { statusId: status('in_progress').id });
    expect(res.statusCode, res.body).toBe(200);
    res = await api('POST', `/tasks/${task.id}/complete`, {});
    expect(res.statusCode, res.body).toBe(200);
    res = await api('POST', `/tasks/${task.id}/complete`, {});
    expect(res.statusCode, res.body).toBe(200);

    const rows = await expectChain(task.id);
    expect(rows.map((p) => p.category)).toEqual([
      'in_progress',
      'review',
      'in_progress',
      'done',
      'in_progress',
    ]);
  });

  it('writes periods and memberships for duplicates, project moves and templates', async () => {
    const { api, project, newProject, status, createTask } = await taskWorld(ctx);
    const sprint = (
      await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
        projectIds: [project.id],
        startDate: '2026-10-06',
        endDate: '2026-10-24',
      })
    ).json<{ id: string; number: number; name: string | null }>();
    expect(sprint).toMatchObject({ number: 1, name: null });

    const source = await createTask({
      title: 'Source',
      statusId: status('review').id,
      sprintId: sprint.id,
    });
    expect(await memberships(source.id)).toMatchObject([{ sprintId: sprint.id, removedAt: null }]);

    const copyRes = await api('POST', `/tasks/${source.id}/duplicate`, {});
    expect(copyRes.statusCode, copyRes.body).toBe(201);
    const copy = taskDetailSchema.parse(copyRes.json());
    expect(await expectChain(copy.id)).toMatchObject([{ category: 'review' }]);
    expect(await memberships(copy.id)).toMatchObject([{ sprintId: sprint.id, removedAt: null }]);

    const other = await newProject('Other');
    const moveRes = await api('POST', `/tasks/${source.id}/move-to-project`, {
      projectId: other.id,
    });
    expect(moveRes.statusCode, moveRes.body).toBe(200);
    const moved = await expectChain(source.id);
    expect(moved.map((p) => p.statusId)).toEqual([status('review').id, status('review', other).id]);
    const [left] = await memberships(source.id);
    expect(left?.removedAt).not.toBeNull();

    const empty = await newProject('Templated');
    const tplRes = await api('POST', `/projects/${empty.id}/from-template`, {
      templateId: 'sprint-planning',
    });
    expect(tplRes.statusCode, tplRes.body).toBe(201);
    const created = await ctx.db.select().from(tasks).where(eq(tasks.projectId, empty.id));
    const ids = created.map((t) => t.id);
    const open = await ctx.db
      .select()
      .from(taskStatusPeriods)
      .where(and(inArray(taskStatusPeriods.taskId, ids), isNull(taskStatusPeriods.exitedAt)));
    expect(open).toHaveLength(created.length);
    const members = await ctx.db
      .select()
      .from(sprintMemberships)
      .where(inArray(sprintMemberships.taskId, ids));
    expect(members).toHaveLength(created.filter((t) => t.sprintId).length);
  });

  it('closes and opens memberships when the sprint changes', async () => {
    const { api, project, createTask, activities } = await taskWorld(ctx);
    const newSprint = async (startDate: string) =>
      (
        await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
          projectIds: [project.id],
          startDate,
          endDate: '2026-12-31',
        })
      ).json<{ id: string; number: number }>();
    const s1 = await newSprint('2026-10-06');
    const s2 = await newSprint('2026-10-27');
    expect([s1.number, s2.number]).toEqual([1, 2]);

    const task = await createTask({ title: 'Carry', sprintId: s1.id });
    for (const sprintId of [s2.id, null, s1.id]) {
      const res = await api('PATCH', `/tasks/${task.id}`, { sprintId });
      expect(res.statusCode, res.body).toBe(200);
    }
    const rows = await memberships(task.id);
    expect(rows.map((m) => [m.sprintId, m.removedAt === null])).toEqual([
      [s1.id, false],
      [s2.id, false],
      [s1.id, true],
    ]);
    const logged = (await activities(task.id)).filter((a) => a.type === 'sprint.changed');
    expect(logged.map((a) => a.payload)).toEqual([
      { from: null, to: { id: s1.id, name: null, number: 1 } },
      { from: { id: s1.id, name: null, number: 1 }, to: { id: s2.id, name: null, number: 2 } },
      { from: { id: s2.id, name: null, number: 2 }, to: null },
      { from: null, to: { id: s1.id, name: null, number: 1 } },
    ]);
  });
});
