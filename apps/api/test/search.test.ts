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
    const target = await createTask({ title: 'Checkout page — responsive layout' });
    await createTask({ title: 'Fix the checkout bug' });
    await createTask({ title: 'Checkout analytics' }, checkout.id);

    const byKey = await search(target.key);
    expect(byKey.tasks[0]?.id).toBe(target.id);
    expect(byKey.tasks[0]).toMatchObject({ key: target.key, project: { id: project.id } });

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

  it('caps the results at 20 and hides other workspaces', async () => {
    const { createTask } = world;
    for (let i = 1; i <= 25; i++) await createTask({ title: `Bulk item ${i}` });
    const other = await taskWorld(ctx);
    await other.createTask({ title: 'Bulk item from elsewhere' });
    const result = await search('Bulk item');
    expect(result.tasks.length + result.projects.length + result.people.length).toBe(20);
    expect(result.tasks.some((t) => t.title.includes('elsewhere'))).toBe(false);
    expect((await search('zzzz-nothing')).tasks).toEqual([]);
  });
});
