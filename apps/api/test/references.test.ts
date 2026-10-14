import { taskDetailSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('task references (KEY-123)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists where a task is mentioned, following edits and deletes', async () => {
    const w = await taskWorld(ctx);
    const target = await w.createTask({ title: 'Payments API' });
    const detail = async () =>
      taskDetailSchema.parse((await w.api('GET', `/tasks/${target.id}`)).json());

    const request = await w.createTask({
      title: `Design for ${target.key}`,
      description: doc(`Needed by ${target.key} and itself`),
    });
    const other = await w.createTask({ title: 'Unrelated' });
    const res = await w.api('POST', `/tasks/${other.id}/comments`, {
      body: doc(`Blocked on ${target.key}`),
    });
    expect(res.statusCode, res.body).toBe(201);
    const commentId = res.json<{ id: string }>().id;

    let refs = (await detail()).mentionedIn;
    expect(refs.map((r) => [r.task.key, r.commentId])).toEqual([
      [other.key, commentId],
      [request.key, null],
    ]);

    // Editing the title and description away from the key drops that reference.
    await w.api('PATCH', `/tasks/${request.id}`, {
      title: 'Design work',
      description: doc('nothing here'),
    });
    await w.api('DELETE', `/comments/${commentId}`);
    refs = (await detail()).mentionedIn;
    expect(refs).toEqual([]);

    // A key from another workspace never resolves.
    const elsewhere = await taskWorld(ctx);
    await elsewhere.createTask({ title: `See ${target.key}` });
    expect((await detail()).mentionedIn).toEqual([]);
  });
});
