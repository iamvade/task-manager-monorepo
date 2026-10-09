import { subtaskSchema, taskDetailSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('subtasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const task = await w.createTask({ title: 'Checkout page' });
    const add = async (title: string, extra: object = {}) => {
      const res = await w.api('POST', `/tasks/${task.id}/subtasks`, { title, ...extra });
      expect(res.statusCode, res.body).toBe(201);
      return subtaskSchema.parse(res.json());
    };
    const titles = async () => {
      const res = await w.api('GET', `/tasks/${task.id}/subtasks`);
      expect(res.statusCode, res.body).toBe(200);
      return z
        .array(subtaskSchema)
        .parse(res.json())
        .map((s) => s.title);
    };
    return { ...w, task, add, titles };
  }

  it('creates at the end or the top, with assignee and due date', async () => {
    const { owner, task, add, titles, api } = await world();
    await add('B');
    const c = await add('C', { assigneeId: owner.id, dueDate: '2026-10-09' });
    await add('A', { position: 'top' });
    expect(await titles()).toEqual(['A', 'B', 'C']);
    expect(c).toMatchObject({
      assignee: { id: owner.id, name: 'Anu Bold' },
      dueDate: '2026-10-09',
      done: false,
    });

    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.subtasks.map((s) => s.title)).toEqual(['A', 'B', 'C']);
    expect(detail.subtaskProgress).toEqual({ done: 0, total: 3 });
  });

  it('logs subtask.added and subtask.completed once; reopening and edits log nothing', async () => {
    const { api, task, add, activities, person } = await world();
    const sub = await add('QA on iOS');
    const { user: bat } = await person('member', 'Bat Od');

    const patch = (body: object) => api('PATCH', `/subtasks/${sub.id}`, body);
    let res = await patch({ title: 'QA on iOS Safari', assigneeId: bat.id, dueDate: '2026-10-10' });
    expect(res.statusCode, res.body).toBe(200);
    expect(subtaskSchema.parse(res.json())).toMatchObject({
      title: 'QA on iOS Safari',
      assignee: { id: bat.id },
      dueDate: '2026-10-10',
    });
    res = await patch({ done: true });
    expect(subtaskSchema.parse(res.json()).done).toBe(true);
    await patch({ done: true }); // no-op
    await patch({ done: false });
    await patch({ assigneeId: null, dueDate: null });

    const rows = (await activities(task.id)).filter((a) => a.type.startsWith('subtask.'));
    expect(rows.map((a) => [a.type, a.payload])).toEqual([
      ['subtask.added', { subtask: { id: sub.id, title: 'QA on iOS' } }],
      ['subtask.completed', { subtask: { id: sub.id, title: 'QA on iOS Safari' } }],
    ]);
  });

  it('reorders between neighbors', async () => {
    const { api, add, titles } = await world();
    const a = await add('A');
    const b = await add('B');
    const c = await add('C');

    let res = await api('POST', `/subtasks/${c.id}/move`, { prevId: null, nextId: a.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(await titles()).toEqual(['C', 'A', 'B']);
    await api('POST', `/subtasks/${c.id}/move`, { prevId: a.id, nextId: b.id });
    expect(await titles()).toEqual(['A', 'C', 'B']);
    await api('POST', `/subtasks/${a.id}/move`, {});
    expect(await titles()).toEqual(['C', 'B', 'A']);

    res = await api('POST', `/subtasks/${a.id}/move`, { prevId: b.id, nextId: c.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_MOVE');
  });

  it('rejects neighbors from another task', async () => {
    const { api, add, createTask } = await world();
    const a = await add('A');
    const other = await createTask({ title: 'Other' });
    const res0 = await api('POST', `/tasks/${other.id}/subtasks`, { title: 'X' });
    const x = subtaskSchema.parse(res0.json());
    const res = await api('POST', `/subtasks/${a.id}/move`, { prevId: x.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_MOVE');
  });

  it('deletes', async () => {
    const { api, add, titles } = await world();
    const a = await add('A');
    await add('B');
    const res = await api('DELETE', `/subtasks/${a.id}`);
    expect(res.statusCode).toBe(204);
    expect(await titles()).toEqual(['B']);
    expect((await api('PATCH', `/subtasks/${a.id}`, { done: true })).statusCode).toBe(404);
  });

  it('validates input and the assignee', async () => {
    const { api, task, add, person } = await world();
    const { user: outsider } = await person(null);
    let res = await api('POST', `/tasks/${task.id}/subtasks`, { title: '  ' });
    expect(res.statusCode).toBe(400);
    res = await api('POST', `/tasks/${task.id}/subtasks`, { title: 'X', assigneeId: outsider.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');
    const a = await add('A');
    res = await api('PATCH', `/subtasks/${a.id}`, {});
    expect(res.statusCode).toBe(400);
    res = await api('PATCH', `/subtasks/${a.id}`, { position: 'a0' });
    expect(res.statusCode).toBe(400);
  });

  it('hides subtasks from outsiders and of deleted tasks', async () => {
    const { api, task, add, person } = await world();
    const a = await add('A');
    const { api: outsider } = await person(null);
    expect((await outsider('GET', `/tasks/${task.id}/subtasks`)).statusCode).toBe(404);
    expect((await outsider('POST', `/tasks/${task.id}/subtasks`, { title: 'x' })).statusCode).toBe(
      404,
    );
    expect((await outsider('PATCH', `/subtasks/${a.id}`, { done: true })).statusCode).toBe(404);
    expect((await outsider('POST', `/subtasks/${a.id}/move`, {})).statusCode).toBe(404);
    expect((await outsider('DELETE', `/subtasks/${a.id}`)).statusCode).toBe(404);

    // Any workspace member may edit.
    const { api: member } = await person('member');
    expect((await member('PATCH', `/subtasks/${a.id}`, { done: true })).statusCode).toBe(200);

    await api('DELETE', `/tasks/${task.id}`);
    expect((await api('GET', `/tasks/${task.id}/subtasks`)).statusCode).toBe(404);
    expect((await api('PATCH', `/subtasks/${a.id}`, { done: false })).statusCode).toBe(404);
  });
});
