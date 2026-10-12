import { taskDetailSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { one } from '../src/db/rows.js';
import { projects } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

/** Task numbers (`APP-142`): per-project, gapless under concurrency, never reused. */
describe('task numbering', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const seq = async (projectId: string) =>
    one(await ctx.db.select().from(projects).where(eq(projects.id, projectId))).taskSeq;
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  it('numbers tasks moved into one project concurrently without gaps or duplicates', async () => {
    const { api, createTask, newProject } = await taskWorld(ctx);
    const target = await newProject('Target');
    await createTask({ title: 'Already there' }, target.id);
    const sources = await Promise.all(range(1, 12).map((i) => createTask({ title: `Mover ${i}` })));

    const responses = await Promise.all(
      sources.map((t) => api('POST', `/tasks/${t.id}/move-to-project`, { projectId: target.id })),
    );
    for (const res of responses) expect(res.statusCode, res.body).toBe(200);
    const moved = responses.map((res) => taskDetailSchema.parse(res.json()));

    expect(moved.map((t) => t.number).sort((a, b) => a - b)).toEqual(range(2, 13));
    expect(moved.every((t) => t.key === `${target.key}-${t.number}`)).toBe(true);
    expect(await seq(target.id)).toBe(13);
  });

  it('survives opposite moves between two projects at the same time (no deadlock)', async () => {
    const { api, project, createTask, newProject } = await taskWorld(ctx);
    const other = await newProject('Other');
    const here = await Promise.all(range(1, 6).map((i) => createTask({ title: `A${i}` })));
    const there = await Promise.all(
      range(1, 6).map((i) => createTask({ title: `B${i}` }, other.id)),
    );

    const responses = await Promise.all([
      ...here.map((t) => api('POST', `/tasks/${t.id}/move-to-project`, { projectId: other.id })),
      ...there.map((t) => api('POST', `/tasks/${t.id}/move-to-project`, { projectId: project.id })),
    ]);
    for (const res of responses) expect(res.statusCode, res.body).toBe(200);
    const moved = responses.map((res) => taskDetailSchema.parse(res.json()));

    const intoOther = moved.filter((t) => t.project.id === other.id).map((t) => t.number);
    const intoHere = moved.filter((t) => t.project.id === project.id).map((t) => t.number);
    expect(intoOther.sort((a, b) => a - b)).toEqual(range(7, 12));
    expect(intoHere.sort((a, b) => a - b)).toEqual(range(7, 12));
    expect(await seq(project.id)).toBe(12);
    expect(await seq(other.id)).toBe(12);
  });

  it('never hands out a number again: not after a move out, nor after a delete', async () => {
    const { api, project, createTask, newProject } = await taskWorld(ctx);
    const other = await newProject('Other');
    const first = await createTask({ title: 'First' });
    const second = await createTask({ title: 'Second' });
    expect([first.number, second.number]).toEqual([1, 2]);

    const res = await api('POST', `/tasks/${second.id}/move-to-project`, {
      projectId: other.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await seq(project.id)).toBe(2);
    expect((await api('DELETE', `/tasks/${first.id}`)).statusCode).toBe(204);

    const third = await createTask({ title: 'Third' });
    expect(third.number).toBe(3);
    expect(third.key).toBe(`${project.key}-3`);
    // The moved task's old key stays dead, it doesn't point at a newer task.
    expect((await api('GET', `/tasks/${second.key}`)).statusCode).toBe(404);
  });

  it('keeps numbers gapless when duplicates race with creates', async () => {
    const { api, project, createTask } = await taskWorld(ctx);
    const source = await createTask({ title: 'Source' });
    const responses = await Promise.all(
      range(1, 16).map((i) =>
        i % 2
          ? api('POST', `/tasks/${source.id}/duplicate`, {})
          : api('POST', `/projects/${project.id}/tasks`, { title: `New ${i}` }),
      ),
    );
    for (const res of responses) expect(res.statusCode, res.body).toBe(201);
    const numbers = responses.map((res) => taskDetailSchema.parse(res.json()).number);
    expect(numbers.sort((a, b) => a - b)).toEqual(range(2, 17));
    expect(await seq(project.id)).toBe(17);
  });

  it('resolves existing tasks under a renamed project key; the old key stops resolving', async () => {
    const { api, project, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Keyed' });
    const newKey = `R${project.key.slice(1)}`.slice(0, 6);
    const res = await api('PATCH', `/projects/${project.id}`, { key: newKey });
    expect(res.statusCode, res.body).toBe(200);

    const renamed = await api('GET', `/tasks/${newKey}-${task.number}`);
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(taskDetailSchema.parse(renamed.json())).toMatchObject({
      id: task.id,
      key: `${newKey}-${task.number}`,
    });
    expect((await api('GET', `/tasks/${task.key}`)).statusCode).toBe(404);
    expect((await createTask({ title: 'Next' })).key).toBe(`${newKey}-2`);
  });
});
