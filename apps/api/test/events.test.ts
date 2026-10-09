import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../src/events/bus.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('task events', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const seen: DomainEvent[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.app.events.on('*', (event) => {
      seen.push(event);
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const eventsFor = (taskId: string) => seen.filter((e) => e.taskId === taskId);

  it('emits after commit with the activity rows of the mutation', async () => {
    const { api, owner, project, status, createTask, activities } = await taskWorld(ctx);
    const task = await createTask({ title: 'T', assigneeIds: [owner.id] });
    // The handler sees the committed row.
    let committed = false;
    const off = ctx.app.events.on('task.updated', async (event) => {
      committed = (await activities(event.taskId)).some((a) => a.type === 'priority.changed');
    });
    await api('PATCH', `/tasks/${task.id}`, { priority: 'high', title: 'T2' });
    await ctx.app.events.idle();
    off();
    expect(committed).toBe(true);

    await api('POST', `/tasks/${task.id}/move`, { statusId: status('todo').id });
    await api('DELETE', `/tasks/${task.id}`);

    const events = eventsFor(task.id);
    expect(events.map((e) => e.type)).toEqual([
      'task.created',
      'task.updated',
      'task.moved',
      'task.deleted',
    ]);
    const [created, updated, moved] = events;
    expect(created).toMatchObject({
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: owner.id,
      assigneeIds: [owner.id],
    });
    const rows = await activities(task.id);
    expect(updated?.activities.map((a) => a.type)).toEqual(['title.changed', 'priority.changed']);
    expect(updated?.activities.map((a) => a.id)).toEqual(
      rows.filter((r) => r.type.endsWith('.changed')).map((r) => r.id),
    );
    expect(moved?.activities).toEqual([]);
  });

  it('emits nothing when the mutation fails or changes nothing', async () => {
    const { api, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'T' });
    const before = eventsFor(task.id).length;
    await api('POST', `/tasks/${task.id}/move`, { statusId: status('todo').id, prevId: task.id });
    await api('PATCH', `/tasks/${task.id}`, { title: 'T' });
    await api('POST', `/tasks/${task.id}/complete`, { done: false });
    expect(eventsFor(task.id)).toHaveLength(before);
  });

  it('isolates failing handlers from the request', async () => {
    const { api, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'T' });
    const offSync = ctx.app.events.on('task.updated', () => {
      throw new Error('sync boom');
    });
    const offAsync = ctx.app.events.on('task.updated', () =>
      Promise.reject(new Error('async boom')),
    );
    const res = await api('PATCH', `/tasks/${task.id}`, { title: 'Still fine' });
    await ctx.app.events.idle();
    offSync();
    offAsync();
    expect(res.statusCode).toBe(200);
  });
});
