import { searchResultSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, createUser } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('workspace search', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let world: Awaited<ReturnType<typeof taskWorld>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    world = await taskWorld(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const search = async (q: string) => {
    const res = await world.api(
      'GET',
      `/workspaces/${world.ws.id}/search?q=${encodeURIComponent(q)}`,
    );
    expect(res.statusCode, res.body).toBe(200);
    return searchResultSchema.parse(res.json());
  };

  it('finds tasks by key and title, projects and people', async () => {
    const { ws, project, createTask, newProject } = world;
    const sara = await createUser(ctx.db, { name: 'Sara Khan' });
    await addMember(ctx.db, ws.id, sara.id);
    const checkout = await newProject('Checkout v2');
    for (let i = 1; i <= 12; i++) await createTask({ title: `Filler ${i}` });
    const target = await createTask({
      title: 'Checkout page — responsive layout',
      dueDate: '2026-10-20',
      assigneeIds: [sara.id],
    });
    await createTask({ title: 'Fix the checkout bug' });
    await createTask({ title: 'Checkout analytics' }, checkout.id);

    const byKey = await search(target.key);
    expect(byKey.tasks[0]?.id).toBe(target.id);
    expect(byKey.tasks[0]).toMatchObject({
      key: target.key,
      project: { id: project.id },
      status: { category: 'todo' },
      dueDate: '2026-10-20',
      assignees: [{ id: sara.id, name: 'Sara Khan' }],
    });

    // `KEY-1` also matches KEY-10, KEY-11…, exact first.
    const partial = await search(`${project.key}-1`);
    expect(partial.tasks[0]?.key).toBe(`${project.key}-1`);
    expect(partial.tasks.map((t) => t.key)).toContain(`${project.key}-12`);

    const byTitle = await search('checkout');
    expect(byTitle.projects.map((p) => p.name)).toEqual(['Checkout v2']);
    // Title prefixes rank first.
    expect(
      byTitle.tasks
        .map((t) => t.title)
        .slice(0, 2)
        .sort(),
    ).toEqual(['Checkout analytics', 'Checkout page — responsive layout']);
    expect(byTitle.tasks.map((t) => t.title)).toContain('Fix the checkout bug');

    expect((await search('sara')).people.map((p) => p.name)).toEqual(['Sara Khan']);
  });

  it('finds people across scripts and by email prefix', async () => {
    const { ws } = world;
    const ganbold = await createUser(ctx.db, { name: 'Бат-Эрдэнэ Ганболд' });
    const tsogt = await createUser(ctx.db, { name: 'Bat-Erdene Tsogt' });
    await addMember(ctx.db, ws.id, ganbold.id);
    await addMember(ctx.db, ws.id, tsogt.id);

    const latin = (await search('bat')).people.map((p) => p.name).sort();
    expect(latin).toEqual(['Bat-Erdene Tsogt', 'Бат-Эрдэнэ Ганболд']);
    const cyrillic = (await search('Бат-Эрдэнэ')).people.map((p) => p.name).sort();
    expect(cyrillic).toEqual(['Bat-Erdene Tsogt', 'Бат-Эрдэнэ Ганболд']);
    expect((await search('цогт')).people.map((p) => p.name)).toEqual(['Bat-Erdene Tsogt']);
    expect((await search(tsogt.email.slice(0, 8))).people.map((p) => p.id)).toContain(tsogt.id);
  });

  it('caps the results at 20 and hides other workspaces', async () => {
    const { createTask } = world;
    for (let i = 1; i <= 25; i++) await createTask({ title: `Bulk item ${i}` });
    const other = await taskWorld(ctx);
    await other.createTask({ title: 'Bulk item from elsewhere' });
    const result = await search('Bulk item');
    expect(result.tasks.length + result.projects.length + result.people.length).toBe(20);
    expect(result.tasks.some((t) => t.title.includes('elsewhere'))).toBe(false);
    expect((await search('zzzz-nothing')).tasks).toEqual([]);

    // "Show more": the next tasks after the first page, tasks only.
    const first = await search('Bulk item');
    expect(first.nextTaskOffset).toBe(first.tasks.length);
    const res = await world.api(
      'GET',
      `/workspaces/${world.ws.id}/search?q=Bulk%20item&offset=${String(first.nextTaskOffset)}`,
    );
    const next = searchResultSchema.parse(res.json());
    expect(next.projects).toEqual([]);
    expect(next.people).toEqual([]);
    expect(next.comments).toEqual([]);
    const ids = new Set(first.tasks.map((t) => t.id));
    expect(next.tasks.length).toBe(25 - first.tasks.length);
    expect(next.tasks.some((t) => ids.has(t.id))).toBe(false);
    expect(next.nextTaskOffset).toBeNull();
  });

  it('finds comments and task descriptions', async () => {
    const { createTask, api } = world;
    const doc = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const pool = await createTask({
      title: 'Database outage',
      description: doc('see the pg bouncer'),
    });
    let res = await api('POST', `/tasks/${pool.id}/comments`, {
      body: doc('Root cause: the connection pool ran out of slots during the deploy.'),
    });
    expect(res.statusCode, res.body).toBe(201);
    const gone = await api('POST', `/tasks/${pool.id}/comments`, {
      body: doc('connection pool, deleted note'),
    });
    res = await api('DELETE', `/comments/${gone.json<{ id: string }>().id}`);
    expect(res.statusCode).toBeLessThan(300);

    const hits = await search('connection pool');
    expect(hits.comments).toHaveLength(1);
    expect(hits.comments[0]).toMatchObject({
      task: { id: pool.id, key: pool.key, title: 'Database outage' },
      snippet: 'Root cause: the connection pool ran out of slots during the deploy.',
    });
    // A description-only match still finds the task.
    expect((await search('pg bouncer')).tasks.map((t) => t.id)).toEqual([pool.id]);
  });
});
