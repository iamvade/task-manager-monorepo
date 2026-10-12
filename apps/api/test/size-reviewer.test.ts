import { SIZE_POINTS, projectDetailSchema, taskDetailSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaskEvent } from '../src/events/bus.js';
import { toRealtime } from '../src/realtime/messages.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('task size and reviewer', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('defines points once', () => {
    expect(SIZE_POINTS).toEqual({ S: 1, M: 3, L: 5, XL: 8 });
  });

  it('sets, logs and clears the size; a no-op writes nothing', async () => {
    const { api, createTask, activities } = await taskWorld(ctx);
    const task = await createTask({ title: 'Sized', size: 'M' });
    expect(task.size).toBe('M');

    for (const size of ['XL', 'XL', null]) {
      const res = await api('PATCH', `/tasks/${task.id}`, { size });
      expect(res.statusCode, res.body).toBe(200);
      expect(taskDetailSchema.parse(res.json()).size).toBe(size);
    }
    const logged = (await activities(task.id)).filter((a) => a.type === 'size.changed');
    expect(logged.map((a) => a.payload)).toEqual([
      { from: 'M', to: 'XL' },
      { from: 'XL', to: null },
    ]);
    const bad = await api('PATCH', `/tasks/${task.id}`, { size: 'XXL' });
    expect(bad.statusCode).toBe(400);
  });

  it('copies the size on duplicate', async () => {
    const { api, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Sized', size: 'L' });
    const res = await api('POST', `/tasks/${task.id}/duplicate`, {});
    expect(taskDetailSchema.parse(res.json()).size).toBe('L');
  });

  it('defaults the reviewer to the project lead when a task enters review', async () => {
    const { api, owner, project, person, status, createTask, activities } = await taskWorld(ctx);
    const lead = await person('member', 'Bat Lead');
    const res = await api('PATCH', `/projects/${project.id}`, { leadId: lead.user.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(projectDetailSchema.parse(res.json()).leadId).toBe(lead.user.id);

    const task = await createTask({ title: 'Review me', statusId: status('in_progress').id });
    const moved = await api('POST', `/tasks/${task.id}/move`, { statusId: status('review').id });
    expect(moved.statusCode, moved.body).toBe(200);
    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.reviewerId).toBe(lead.user.id);
    expect(detail.reviewer).toMatchObject({ id: lead.user.id, name: 'Bat Lead' });

    // Leaving review keeps the reviewer; coming back doesn't replace it.
    await api('PATCH', `/tasks/${task.id}`, { statusId: status('in_progress').id });
    await api('PATCH', `/projects/${project.id}`, { leadId: owner.id });
    await api('PATCH', `/tasks/${task.id}`, { statusId: status('review').id });
    const again = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(again.reviewerId).toBe(lead.user.id);

    const logged = (await activities(task.id)).filter((a) => a.type === 'reviewer.changed');
    expect(logged.map((a) => a.payload)).toEqual([
      { from: null, to: { id: lead.user.id, name: 'Bat Lead' } },
    ]);
  });

  it('uses the reviewer picked with the status change, or none when null', async () => {
    const { api, person, status, createTask } = await taskWorld(ctx);
    const picked = await person('member', 'Mia Pick');
    const a = await createTask({ title: 'A' });
    const res = await api('PATCH', `/tasks/${a.id}`, {
      statusId: status('review').id,
      reviewerId: picked.user.id,
    });
    expect(taskDetailSchema.parse(res.json()).reviewerId).toBe(picked.user.id);

    const b = await createTask({ title: 'B' });
    const none = await api('PATCH', `/tasks/${b.id}`, {
      statusId: status('review').id,
      reviewerId: null,
    });
    expect(taskDetailSchema.parse(none.json()).reviewerId).toBeNull();
  });

  it('leaves the reviewer empty without a lead, and rejects non-members', async () => {
    const { api, person, status, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'No lead', statusId: status('review').id });
    expect(task.reviewerId).toBeNull();

    const outsider = await person(null, 'Out Sider');
    const res = await api('PATCH', `/tasks/${task.id}`, { reviewerId: outsider.user.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');
    const lead = await api('PATCH', `/projects/${task.project.id}`, { leadId: outsider.user.id });
    expect(errorCode(lead)).toBe('INVALID_REFERENCE');
  });

  it('carries size and reviewer in realtime task.updated', async () => {
    const { api, person, createTask } = await taskWorld(ctx);
    const reviewer = await person('member', 'Rev Iewer');
    const task = await createTask({ title: 'Live' });
    const seen: TaskEvent[] = [];
    const off = ctx.app.events.on('*', (event) => {
      if (event.taskId === task.id) seen.push(event);
    });
    await api('PATCH', `/tasks/${task.id}`, { size: 'S', reviewerId: reviewer.user.id });
    off();
    expect(seen.map(toRealtime)).toMatchObject([
      {
        type: 'task.updated',
        changes: ['size.changed', 'reviewer.changed'],
        size: 'S',
        reviewerId: reviewer.user.id,
      },
    ]);
  });
});
