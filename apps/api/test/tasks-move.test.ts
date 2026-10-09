import { taskListItemSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('moving tasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function board() {
    const world = await taskWorld(ctx);
    const todo = world.status('todo').id;
    const [a, b, c, d] = [
      await world.createTask({ title: 'A' }),
      await world.createTask({ title: 'B' }),
      await world.createTask({ title: 'C' }),
      await world.createTask({ title: 'D' }),
    ].map((t) => t.id);
    if (!a || !b || !c || !d) throw new Error('setup');
    const move = async (id: string, body: object) => {
      const res = await world.api('POST', `/tasks/${id}/move`, body);
      return res;
    };
    const column = async (statusId: string) =>
      (await world.list(`?statusId=${statusId}`)).map((t) => t.title);
    return { ...world, todo, a, b, c, d, move, column };
  }

  it('reorders within a status (top, middle, end) without touching other rows', async () => {
    const { todo, a, b, c, d, move, column, list, activities } = await board();
    const before = new Map((await list()).map((t) => [t.id, t.position]));

    let res = await move(d, { statusId: todo, nextId: a });
    expect(res.statusCode, res.body).toBe(200);
    expect(await column(todo)).toEqual(['D', 'A', 'B', 'C']);

    res = await move(a, { statusId: todo, prevId: b, nextId: c });
    expect(res.statusCode, res.body).toBe(200);
    expect(await column(todo)).toEqual(['D', 'B', 'A', 'C']);

    await move(d, { statusId: todo, prevId: c });
    expect(await column(todo)).toEqual(['B', 'A', 'C', 'D']);
    await move(b, { statusId: todo });
    expect(await column(todo)).toEqual(['A', 'C', 'D', 'B']);

    const after = new Map((await list()).map((t) => [t.id, t.position]));
    expect(after.get(c)).toBe(before.get(c));
    // A pure reorder writes no history.
    expect((await activities(d)).map((x) => x.type)).toEqual(['task.created']);
  });

  it('moves across statuses and logs the status change', async () => {
    const { owner, status, todo, a, b, c, move, column, activities } = await board();
    const review = status('review').id;
    let res = await move(b, { statusId: review });
    expect(res.statusCode, res.body).toBe(200);
    const moved = taskListItemSchema.parse(res.json());
    expect(moved.status).toMatchObject({ id: review, category: 'review' });

    res = await move(c, { statusId: review, nextId: b });
    expect(res.statusCode).toBe(200);
    expect(await column(review)).toEqual(['C', 'B']);
    expect(await column(todo)).toEqual(['A', 'D']);

    const done = status('done').id;
    const completed = taskListItemSchema.parse((await move(a, { statusId: done })).json());
    expect(completed.completedAt).not.toBeNull();
    const reopened = taskListItemSchema.parse((await move(a, { statusId: todo })).json());
    expect(reopened.completedAt).toBeNull();

    const history = await activities(b);
    expect(history.map((x) => x.type)).toEqual(['task.created', 'status.changed']);
    expect(history[1]).toMatchObject({
      actorId: owner.id,
      payload: {
        from: { id: todo, name: null, category: 'todo' },
        to: { id: review, name: null, category: 'review' },
      },
    });
  });

  it('lands right after the neighbor even when the client hides tasks between', async () => {
    const { todo, a, c, d, move, column } = await board();
    // A client filtering out B and C sees [A, D] and drops D after A (before nothing visible).
    const res = await move(d, { statusId: todo, prevId: a });
    expect(res.statusCode, res.body).toBe(200);
    expect(await column(todo)).toEqual(['A', 'D', 'B', 'C']);
    // Same with only the next neighbor: drop A right before C.
    await move(a, { statusId: todo, nextId: c });
    expect(await column(todo)).toEqual(['D', 'B', 'A', 'C']);
  });

  it('rejects bad neighbors and statuses', async () => {
    const world = await board();
    const other = await taskWorld(ctx);
    const foreign = await other.createTask({ title: 'X' });
    const { todo, a, b, c, move, status } = world;

    const cases: [object, string][] = [
      [{ statusId: todo, prevId: c, nextId: b }, 'INVALID_MOVE'],
      [{ statusId: todo, prevId: b, nextId: b }, 'INVALID_MOVE'],
      [{ statusId: todo, prevId: a }, 'INVALID_MOVE'], // itself
      [{ statusId: status('review').id, prevId: b }, 'INVALID_MOVE'], // not in that status
      [{ statusId: todo, prevId: foreign.id }, 'INVALID_MOVE'],
      [{ statusId: other.status('todo').id }, 'INVALID_REFERENCE'],
    ];
    for (const [body, code] of cases) {
      const res = await move(a, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(errorCode(res)).toBe(code);
    }
  });

  it('gives concurrent drops into the same slot distinct, ordered positions', async () => {
    const { todo, a, b, c, d, move, list } = await board();
    const results = await Promise.all([
      move(c, { statusId: todo, prevId: a, nextId: b }),
      move(d, { statusId: todo, prevId: a, nextId: b }),
    ]);
    for (const res of results) expect(res.statusCode, res.body).toBe(200);
    const tasks = await list();
    expect(tasks[0]?.id).toBe(a);
    expect(tasks[3]?.id).toBe(b);
    expect(new Set(tasks.map((t) => t.position)).size).toBe(4);
  });

  it('never reuses the slot of a deleted task, so restore keeps its place', async () => {
    const { api, todo, a, b, c, d, move, column } = await board();
    expect((await api('DELETE', `/tasks/${b}`)).statusCode).toBe(204);
    expect(await column(todo)).toEqual(['A', 'C', 'D']);
    // Drop D between A and C: the key must skip past the deleted B.
    expect((await move(d, { statusId: todo, prevId: a, nextId: c })).statusCode).toBe(200);
    // A deleted task can't be a neighbor.
    expect((await move(c, { statusId: todo, prevId: b })).statusCode).toBe(400);

    expect((await api('POST', `/tasks/${b}/restore`)).statusCode).toBe(200);
    const order = await column(todo);
    expect(order).toEqual(['A', 'D', 'B', 'C']);
  });
});
