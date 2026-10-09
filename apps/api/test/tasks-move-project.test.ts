import { taskDetailSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activity } from '../src/db/schema/index.js';
import { addMember, createSpace, createWorkspace, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('moving tasks to another project', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('gives the task a new key, the matching status and no sprint', async () => {
    const world = await taskWorld(ctx);
    const { api, project, newProject, status, createTask, list, activities } = world;
    const other = await newProject('Checkout');
    await createTask({ title: 'Existing' }, other.id);

    const sprintRes = await api('POST', `/projects/${project.id}/sprints`, {
      name: 'Sprint 14',
      startDate: '2026-10-06',
      endDate: '2026-10-24',
    });
    expect(sprintRes.statusCode, sprintRes.body).toBe(201);
    const sprintId = sprintRes.json<{ id: string }>().id;
    const task = await createTask({
      title: 'Move me',
      statusId: status('review').id,
      sprintId,
    });
    const sub = await api('POST', `/tasks/${task.id}/subtasks`, { title: 'Sub' });
    expect(sub.statusCode).toBe(201);
    await api('POST', `/tasks/${task.id}/comments`, {
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
      },
    });

    const res = await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: other.id });
    expect(res.statusCode, res.body).toBe(200);
    const moved = taskDetailSchema.parse(res.json());
    expect(moved).toMatchObject({
      id: task.id,
      key: `${other.key}-2`,
      project: { id: other.id },
      status: { id: status('review', other).id, category: 'review' },
      sprintId: null,
      commentCount: 1,
    });
    expect(moved.subtasks.map((s) => s.title)).toEqual(['Sub']);

    expect((await list()).map((t) => t.id)).not.toContain(task.id);
    expect((await list('', other.id)).map((t) => t.title)).toEqual(['Existing', 'Move me']);

    // The old key no longer resolves; the new one does.
    expect((await api('GET', `/tasks/${task.key}`)).statusCode).toBe(404);
    expect((await api('GET', `/tasks/${moved.key}`)).statusCode).toBe(200);

    const history = await activities(task.id);
    expect(history.at(-1)).toMatchObject({
      type: 'project.changed',
      projectId: other.id,
      payload: {
        from: { projectId: project.id, name: project.name, key: task.key },
        to: { projectId: other.id, name: other.name, key: moved.key },
      },
    });
    const rows = await ctx.db.select().from(activity).where(eq(activity.taskId, task.id));
    expect(rows.every((r) => r.projectId === other.id)).toBe(true);
  });

  it('keeps a done task completed', async () => {
    const world = await taskWorld(ctx);
    const other = await world.newProject('Other');
    const task = await world.createTask({ title: 'Done one', statusId: world.status('done').id });
    const res = await world.api('POST', `/tasks/${task.id}/move-to-project`, {
      projectId: other.id,
    });
    const moved = taskDetailSchema.parse(res.json());
    expect(moved.status.category).toBe('done');
    expect(moved.completedAt).toBe(task.completedAt);
  });

  it('rejects the same project, archived projects and other workspaces', async () => {
    const world = await taskWorld(ctx);
    const { api, owner, project, newProject, createTask } = world;
    const task = await createTask({ title: 'Stay' });

    let res = await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: project.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');

    const archived = await newProject('Old');
    await api('POST', `/projects/${archived.id}/archive`);
    res = await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: archived.id });
    expect(res.statusCode).toBe(400);

    const ws2 = await createWorkspace(ctx.db, owner.id);
    const space2 = await createSpace(ctx.db, ws2.id);
    const foreignRes = await api('POST', `/workspaces/${ws2.id}/projects`, {
      spaceId: space2.id,
      name: 'Elsewhere',
    });
    expect(foreignRes.statusCode, foreignRes.body).toBe(201);
    const foreignId = foreignRes.json<{ id: string }>().id;
    res = await api('POST', `/tasks/${task.id}/move-to-project`, { projectId: foreignId });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');

    // A member of the source workspace who can't see the target gets 404.
    const sara = await world.person('member');
    res = await sara.api('POST', `/tasks/${task.id}/move-to-project`, { projectId: foreignId });
    expect(res.statusCode).toBe(404);
    await addMember(ctx.db, ws2.id, sara.user.id);
    res = await sara.api('POST', `/tasks/${task.id}/move-to-project`, { projectId: foreignId });
    expect(res.statusCode).toBe(400);

    const fetched = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(fetched.project.id).toBe(project.id);
  });
});
