import { taskDetailSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, apiClient, createUser, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('task access', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("answers 404 on every task route for another workspace's tasks", async () => {
    const owner = await taskWorld(ctx);
    const { project, space, ws, status } = owner;
    const task = await owner.createTask({ title: 'Secret' });
    const { api } = await taskWorld(ctx, 'Outsider');

    const calls: [Parameters<typeof api>[0], string, object?][] = [
      ['GET', `/projects/${project.id}/tasks`],
      ['GET', `/spaces/${space.id}/tasks`],
      ['GET', `/tasks/${task.id}`],
      ['GET', `/tasks/${task.key}`],
      ['GET', `/workspaces/${ws.id}/search?q=Secret`],
      ['POST', `/projects/${project.id}/tasks`, { title: 'x' }],
      ['PATCH', `/tasks/${task.id}`, { title: 'x' }],
      ['POST', `/tasks/${task.id}/move`, { statusId: status('done').id }],
      ['PUT', `/tasks/${task.id}/assignees`, { userIds: [] }],
      ['PUT', `/tasks/${task.id}/tags`, { tagIds: [] }],
      ['POST', `/tasks/${task.id}/complete`, {}],
      ['DELETE', `/tasks/${task.id}`],
      ['POST', `/tasks/${task.id}/restore`],
    ];
    for (const [method, path, body] of calls) {
      const res = await api(method, path, body);
      expect(res.statusCode, `${method} ${path}`).toBe(404);
    }
    expect((await apiClient(ctx.app)('GET', `/tasks/${task.id}`)).statusCode).toBe(401);

    const after = taskDetailSchema.parse((await owner.api('GET', `/tasks/${task.id}`)).json());
    expect(after).toMatchObject({ title: 'Secret', deletedAt: null, status: { category: 'todo' } });
    expect(await owner.activities(task.id)).toHaveLength(1);
  });

  it('lets any workspace member edit', async () => {
    const { ws, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Shared' });
    const member = await createUser(ctx.db);
    await addMember(ctx.db, ws.id, member.id);
    const api = apiClient(ctx.app, await login(ctx.app, member.email));
    expect((await api('PATCH', `/tasks/${task.id}`, { title: 'Edited' })).statusCode).toBe(200);
    expect((await api('POST', `/tasks/${task.id}/complete`)).statusCode).toBe(200);
  });

  it('resolves a key that exists in two of my workspaces only with workspaceId', async () => {
    const first = await taskWorld(ctx);
    const second = await taskWorld(ctx);
    // Same key in both workspaces; the first owner joins the second workspace.
    const key = `K${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const p1 = await first.api('PATCH', `/projects/${first.project.id}`, { key });
    const p2 = await second.api('PATCH', `/projects/${second.project.id}`, { key });
    expect([p1.statusCode, p2.statusCode]).toEqual([200, 200]);
    const t1 = await first.createTask({ title: 'One' });
    const t2 = await second.createTask({ title: 'Two' });
    expect(t1.key).toBe(t2.key);
    await addMember(ctx.db, second.ws.id, first.owner.id);

    const ambiguous = await first.api('GET', `/tasks/${t1.key}`);
    expect(ambiguous.statusCode).toBe(409);
    expect(errorCode(ambiguous)).toBe('TASK_KEY_AMBIGUOUS');
    const scoped = await first.api('GET', `/tasks/${t1.key}?workspaceId=${second.ws.id}`);
    expect(taskDetailSchema.parse(scoped.json()).id).toBe(t2.id);
    // Only one match for the second owner.
    expect(taskDetailSchema.parse((await second.api('GET', `/tasks/${t2.key}`)).json()).id).toBe(
      t2.id,
    );
  });
});
