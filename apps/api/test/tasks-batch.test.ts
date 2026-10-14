import { taskListItemSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from './helpers.js';
import { insertSprint } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

describe('batch task routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const sara = await w.person('member', 'Sara Khan');
    const tasks = [];
    for (const title of ['One', 'Two', 'Three']) tasks.push(await w.createTask({ title }));
    const batch = (body: object, projectId = w.project.id) =>
      w.api('POST', `/projects/${projectId}/tasks/batch`, body);
    return { ...w, sara, tasks, batch };
  }

  it('applies per-task values in one go, with the usual activity rows', async () => {
    const w = await world();
    const sprint = await insertSprint(ctx.db, w.project.id, 1, '2026-10-05', '2026-10-16');
    const [one, two] = w.tasks;
    if (!one || !two) throw new Error('fixture');
    const res = await w.batch({
      updates: [
        {
          id: one.id,
          statusId: w.status('review').id,
          sprintId: sprint.id,
          assigneeIds: [w.sara.user.id],
          priority: 'high',
          dueDate: '2026-10-20',
        },
        { id: two.id, assigneeIds: [w.sara.user.id, w.owner.id] },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = z.array(taskListItemSchema).parse(res.json());
    expect(rows.map((r) => r.id)).toEqual([one.id, two.id]);
    expect(rows[0]).toMatchObject({
      status: { category: 'review' },
      sprintId: sprint.id,
      priority: 'high',
      dueDate: '2026-10-20',
      assignees: [{ id: w.sara.user.id }],
    });
    expect(rows[1]?.assignees.map((u) => u.id).sort()).toEqual([w.sara.user.id, w.owner.id].sort());
    const types = (await w.activities(one.id)).map((a) => a.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'status.changed',
        'sprint.changed',
        'priority.changed',
        'due.changed',
        'assignee.added',
      ]),
    );
  });

  it('changes nothing when one task is not in the project', async () => {
    const w = await world();
    const other = await w.newProject('Other');
    const stranger = await w.createTask({ title: 'Elsewhere' }, other.id);
    const [one] = w.tasks;
    if (!one) throw new Error('fixture');
    const res = await w.batch({
      updates: [
        { id: one.id, priority: 'urgent' },
        { id: stranger.id, priority: 'urgent' },
      ],
    });
    expect(res.statusCode).toBe(404);
    expect((await w.list()).find((t) => t.id === one.id)?.priority).toBe('none');
    // Duplicate ids and empty batches are rejected.
    expect((await w.batch({ updates: [] })).statusCode).toBe(400);
    expect(
      (await w.batch({ updates: [{ id: one.id }, { id: one.id, priority: 'low' }] })).statusCode,
    ).toBe(400);
  });

  it('deletes and restores many tasks', async () => {
    const w = await world();
    const ids = w.tasks.map((t) => t.id);
    let res = await w.api('POST', `/projects/${w.project.id}/tasks/batch-delete`, { ids });
    expect(res.statusCode, res.body).toBe(204);
    expect(await w.titles()).toEqual([]);
    res = await w.api('POST', `/projects/${w.project.id}/tasks/batch-restore`, { ids });
    expect(res.statusCode, res.body).toBe(204);
    expect(await w.titles()).toEqual(['One', 'Two', 'Three']);
    const types = (await w.activities(ids[0] ?? '')).map((a) => a.type);
    expect(types).toEqual(['task.created', 'task.deleted', 'task.restored']);
  });

  it('answers 404 outside the workspace', async () => {
    const w = await world();
    const outsider = await taskWorld(ctx, 'Outsider');
    const res = await outsider.api('POST', `/projects/${w.project.id}/tasks/batch`, {
      updates: [{ id: w.tasks[0]?.id, priority: 'low' }],
    });
    expect(res.statusCode).toBe(404);
  });
});
