import { subtaskSchema, taskDetailSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('duplicating tasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('copies fields, assignees, tags and unchecked subtasks right after the original', async () => {
    const world = await taskWorld(ctx);
    const { api, owner, project, ws, createTask, titles, activities } = world;
    const sara = await world.person('member');
    const tagRes = await api('POST', `/workspaces/${ws.id}/tags`, {
      name: 'Frontend',
      color: 'neutral',
    });
    expect(tagRes.statusCode, tagRes.body).toBe(201);
    const tagId = tagRes.json<{ id: string }>().id;
    const description = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ping ' },
            { type: 'mention', attrs: { id: sara.user.id, label: 'Sara K.' } },
          ],
        },
      ],
    };

    const a = await createTask({ title: 'A' });
    const source = await createTask({
      title: 'Checkout',
      description,
      priority: 'urgent',
      startDate: '2026-10-04',
      dueDate: '2026-10-08',
      assigneeIds: [owner.id],
      tagIds: [tagId],
    });
    await createTask({ title: 'C' });
    for (const title of ['One', 'Two']) {
      const res = await api('POST', `/tasks/${source.id}/subtasks`, { title });
      expect(res.statusCode, res.body).toBe(201);
    }
    const [first] = z
      .array(subtaskSchema)
      .parse((await api('GET', `/tasks/${source.id}/subtasks`)).json());
    if (!first) throw new Error('setup');
    await api('PATCH', `/subtasks/${first.id}`, { done: true });

    const res = await api('POST', `/tasks/${source.id}/duplicate`, { title: 'Checkout (copy)' });
    expect(res.statusCode, res.body).toBe(201);
    const copy = taskDetailSchema.parse(res.json());

    expect(copy.id).not.toBe(source.id);
    expect(copy.key).toBe(`${project.key}-4`);
    expect(copy).toMatchObject({
      title: 'Checkout (copy)',
      priority: 'urgent',
      startDate: '2026-10-04',
      dueDate: '2026-10-08',
      status: { id: source.status.id },
      description,
    });
    expect(copy.assignees.map((u) => u.id)).toEqual([owner.id]);
    expect(copy.tags.map((t) => t.id)).toEqual([tagId]);
    expect(copy.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['One', false],
      ['Two', false],
    ]);
    expect(copy.attachments).toEqual([]);
    expect(copy.followers.map((u) => u.id).sort()).toEqual([owner.id, sara.user.id].sort());
    expect(await titles('?sort=position')).toEqual(['A', 'Checkout', 'Checkout (copy)', 'C']);
    expect(a.id).toBeTruthy();

    const history = await activities(copy.id);
    expect(history.map((x) => [x.type, x.payload])).toEqual([
      [
        'task.created',
        expect.objectContaining({ duplicateOf: { id: source.id, key: source.key } }),
      ],
    ]);
  });

  it('keeps the title without a body and answers 404 for deleted or foreign tasks', async () => {
    const world = await taskWorld(ctx);
    const task = await world.createTask({ title: 'Solo' });

    const res = await world.api('POST', `/tasks/${task.id}/duplicate`);
    expect(res.statusCode, res.body).toBe(201);
    expect(taskDetailSchema.parse(res.json()).title).toBe('Solo');

    const outsider = await world.person(null, 'Out Sider');
    const denied = await outsider.api('POST', `/tasks/${task.id}/duplicate`, {});
    expect(denied.statusCode).toBe(404);

    await world.api('DELETE', `/tasks/${task.id}`);
    const gone = await world.api('POST', `/tasks/${task.id}/duplicate`, {});
    expect(gone.statusCode).toBe(404);
    expect(errorCode(gone)).toBe('NOT_FOUND');
  });
});
