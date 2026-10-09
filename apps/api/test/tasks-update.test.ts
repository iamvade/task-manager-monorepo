import { taskDetailSchema, taskListItemSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { one } from '../src/db/rows.js';
import { sprints, statuses, tags } from '../src/db/schema/index.js';
import { addMember, createUser, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('updating tasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('writes one activity row per changed field with display snapshots', async () => {
    const world = await taskWorld(ctx);
    const { api, owner, project, status, createTask, activities } = world;
    const sprint = one(
      await ctx.db
        .insert(sprints)
        .values({
          projectId: project.id,
          name: 'Oct 6 – Oct 24',
          startDate: '2026-10-06',
          endDate: '2026-10-24',
        })
        .returning(),
    );
    const task = await createTask({ title: 'Old', priority: 'high', dueDate: '2026-10-14' });
    const description = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    };

    const res = await api('PATCH', `/tasks/${task.id}`, {
      title: 'New',
      priority: 'urgent',
      dueDate: null,
      startDate: '2026-10-01',
      sprintId: sprint.id,
      statusId: status('in_progress').id,
      description,
    });
    expect(res.statusCode, res.body).toBe(200);
    const updated = taskDetailSchema.parse(res.json());
    expect(updated).toMatchObject({
      title: 'New',
      priority: 'urgent',
      dueDate: null,
      startDate: '2026-10-01',
      sprintId: sprint.id,
      sprint: { id: sprint.id, name: 'Oct 6 – Oct 24' },
      status: { category: 'in_progress' },
      description,
      descriptionText: 'Hello world',
    });
    expect(updated.updatedAt > task.updatedAt).toBe(true);

    const rows = await activities(task.id);
    const byType = Object.fromEntries(
      rows.filter((r) => r.type !== 'task.created').map((r) => [r.type, r.payload]),
    );
    expect(rows.every((r) => r.actorId === owner.id)).toBe(true);
    expect(byType).toEqual({
      'title.changed': { from: 'Old', to: 'New' },
      'description.changed': {},
      'priority.changed': { from: 'high', to: 'urgent' },
      'start.changed': { from: null, to: '2026-10-01' },
      'due.changed': { from: '2026-10-14', to: null },
      'sprint.changed': { from: null, to: { id: sprint.id, name: 'Oct 6 – Oct 24' } },
      'status.changed': {
        from: { id: status('todo').id, name: null, category: 'todo' },
        to: { id: status('in_progress').id, name: null, category: 'in_progress' },
      },
    });

    // Sending the same values again changes nothing and logs nothing.
    const again = await api('PATCH', `/tasks/${task.id}`, {
      title: 'New',
      priority: 'urgent',
      description: { content: description.content, type: 'doc' },
    });
    expect(again.statusCode).toBe(200);
    expect(taskDetailSchema.parse(again.json()).updatedAt).toBe(updated.updatedAt);
    expect(await activities(task.id)).toHaveLength(rows.length);

    expect((await api('PATCH', `/tasks/${task.id}`, {})).statusCode).toBe(400);
    expect((await api('PATCH', `/tasks/${task.id}`, { bogus: 1 })).statusCode).toBe(400);
  });

  it('sets completed_at on entering done, keeps it between done statuses, clears it on leaving', async () => {
    const { api, project, status, createTask } = await taskWorld(ctx);
    const shipped = one(
      await ctx.db
        .insert(statuses)
        .values({ projectId: project.id, name: 'Shipped', category: 'done', position: 'a9' })
        .returning(),
    );
    const task = await createTask({ title: 'T' });
    const patch = async (statusId: string) =>
      taskDetailSchema.parse((await api('PATCH', `/tasks/${task.id}`, { statusId })).json());

    const done = await patch(status('done').id);
    expect(done.completedAt).not.toBeNull();
    const stillDone = await patch(shipped.id);
    expect(stillDone.completedAt).toBe(done.completedAt);
    expect(stillDone.status.name).toBe('Shipped');
    const reopened = await patch(status('review').id);
    expect(reopened.completedAt).toBeNull();
  });

  it('completes and reopens back to the previous status', async () => {
    const { api, status, createTask, activities } = await taskWorld(ctx);
    const task = await createTask({ title: 'T', statusId: status('review').id });
    const complete = async (body?: object) => {
      const res = await api('POST', `/tasks/${task.id}/complete`, body);
      expect(res.statusCode, res.body).toBe(200);
      return taskListItemSchema.parse(res.json());
    };

    const done = await complete();
    expect(done.status.category).toBe('done');
    expect(done.completedAt).not.toBeNull();
    // Idempotent with an explicit state.
    expect((await complete({ done: true })).completedAt).toBe(done.completedAt);

    const reopened = await complete();
    expect(reopened.status.id).toBe(status('review').id);
    expect(reopened.completedAt).toBeNull();
    expect((await complete({ done: false })).status.id).toBe(status('review').id);

    const types = (await activities(task.id)).map((a) => a.type);
    expect(types).toEqual(['task.created', 'status.changed', 'status.changed']);
  });

  it('reopens a task created as done into the first To Do status', async () => {
    const { api, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'T', statusId: status('done').id });
    const res = await api('POST', `/tasks/${task.id}/complete`, { done: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(taskListItemSchema.parse(res.json()).status.id).toBe(status('todo').id);
  });

  it('replaces assignee and tag sets with added/removed history', async () => {
    const { api, ws, owner, createTask, activities } = await taskWorld(ctx);
    const sara = await createUser(ctx.db, { name: 'Sara K.' });
    const dorj = await createUser(ctx.db, { name: 'Dorj E.' });
    await addMember(ctx.db, ws.id, sara.id);
    await addMember(ctx.db, ws.id, dorj.id);
    const [research, ux] = await ctx.db
      .insert(tags)
      .values([
        { workspaceId: ws.id, name: 'Research', color: 'blue' },
        { workspaceId: ws.id, name: 'UX/UI', color: 'violet' },
      ])
      .returning();
    if (!research || !ux) throw new Error('setup');
    const task = await createTask({ title: 'T', assigneeIds: [sara.id], tagIds: [research.id] });

    let res = await api('PUT', `/tasks/${task.id}/assignees`, { userIds: [dorj.id, owner.id] });
    expect(res.statusCode, res.body).toBe(200);
    expect(taskListItemSchema.parse(res.json()).assignees.map((a) => a.name)).toEqual([
      'Anu Bold',
      'Dorj E.',
    ]);
    res = await api('PUT', `/tasks/${task.id}/tags`, { tagIds: [ux.id] });
    expect(res.statusCode, res.body).toBe(200);
    expect(taskListItemSchema.parse(res.json()).tags.map((t) => t.name)).toEqual(['UX/UI']);

    const rows = (await activities(task.id)).slice(1).map((a) => [a.type, a.payload]);
    expect(rows).toEqual([
      ['assignee.removed', { user: { id: sara.id, name: 'Sara K.' } }],
      ['assignee.added', { user: { id: owner.id, name: 'Anu Bold' } }],
      ['assignee.added', { user: { id: dorj.id, name: 'Dorj E.' } }],
      ['tag.removed', { tag: { id: research.id, name: 'Research', color: 'blue' } }],
      ['tag.added', { tag: { id: ux.id, name: 'UX/UI', color: 'violet' } }],
    ]);

    // New assignees follow; removed ones keep following.
    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.followers.map((f) => f.name)).toEqual(['Anu Bold', 'Dorj E.', 'Sara K.']);

    // Same set again: no-op.
    await api('PUT', `/tasks/${task.id}/tags`, { tagIds: [ux.id] });
    expect(await activities(task.id)).toHaveLength(rows.length + 1);

    const outsider = await createUser(ctx.db);
    res = await api('PUT', `/tasks/${task.id}/assignees`, { userIds: [outsider.id] });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');
  });

  it('soft-deletes and restores', async () => {
    const { api, createTask, titles, activities } = await taskWorld(ctx);
    const task = await createTask({ title: 'Trash me' });

    expect((await api('DELETE', `/tasks/${task.id}`)).statusCode).toBe(204);
    expect(await titles()).toEqual([]);
    const deleted = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(deleted.deletedAt).not.toBeNull();
    // Deleted tasks can't be edited or deleted again.
    expect((await api('PATCH', `/tasks/${task.id}`, { title: 'x' })).statusCode).toBe(404);
    expect((await api('DELETE', `/tasks/${task.id}`)).statusCode).toBe(404);

    const restored = await api('POST', `/tasks/${task.id}/restore`);
    expect(restored.statusCode, restored.body).toBe(200);
    expect(taskDetailSchema.parse(restored.json()).deletedAt).toBeNull();
    expect(await titles()).toEqual(['Trash me']);
    const again = await api('POST', `/tasks/${task.id}/restore`);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe('TASK_NOT_DELETED');

    expect((await activities(task.id)).map((a) => a.type)).toEqual([
      'task.created',
      'task.deleted',
      'task.restored',
    ]);
  });

  it('keeps a task readable after its sprint is deleted', async () => {
    const { api, project, createTask } = await taskWorld(ctx);
    const sprint = one(
      await ctx.db
        .insert(sprints)
        .values({
          projectId: project.id,
          name: 'S',
          startDate: '2026-10-01',
          endDate: '2026-10-10',
        })
        .returning(),
    );
    const task = await createTask({ title: 'T', sprintId: sprint.id });
    await ctx.db.delete(sprints).where(eq(sprints.id, sprint.id));
    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.sprint).toBeNull();
  });
});
