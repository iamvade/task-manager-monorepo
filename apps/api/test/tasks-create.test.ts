import { taskDetailSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { one } from '../src/db/rows.js';
import { projects, tags } from '../src/db/schema/index.js';
import { addMember, createUser, createWorkspace, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('creating tasks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('allocates unique, gapless numbers under concurrent creates', async () => {
    const { api, project, list } = await taskWorld(ctx);
    const n = 25;
    const responses = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        api('POST', `/projects/${project.id}/tasks`, { title: `Task ${i}` }),
      ),
    );
    for (const res of responses) expect(res.statusCode, res.body).toBe(201);
    const created = responses.map((res) => taskDetailSchema.parse(res.json()));

    const numbers = created.map((t) => t.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(new Set(created.map((t) => t.key)).size).toBe(n);
    expect(created.every((t) => t.key === `${project.key}-${t.number}`)).toBe(true);

    const row = one(await ctx.db.select().from(projects).where(eq(projects.id, project.id)));
    expect(row.taskSeq).toBe(n);

    // Each create appended under the lock, so board order = number order.
    const listed = await list();
    expect(listed.map((t) => t.number)).toEqual(numbers);
    expect(new Set(listed.map((t) => t.position)).size).toBe(n);
  });

  it('defaults to the first To Do status, no priority, the end of the status', async () => {
    const { owner, project, status, createTask, activities } = await taskWorld(ctx);
    const first = await createTask({ title: 'First' });
    const second = await createTask({ title: 'Second' });
    const top = await createTask({ title: 'Top', position: 'top' });

    expect(first.status.id).toBe(status('todo').id);
    expect(first.priority).toBe('none');
    expect(first.number).toBe(1);
    expect(first.project).toMatchObject({ id: project.id, key: project.key });
    expect(first.creator.id).toBe(owner.id);
    expect(first.followers.map((f) => f.id)).toEqual([owner.id]);
    expect(first.completedAt).toBeNull();
    expect(second.position > first.position).toBe(true);
    expect(top.position < first.position).toBe(true);

    const [created] = await activities(first.id);
    expect(created).toMatchObject({
      type: 'task.created',
      actorId: owner.id,
      payload: { status: { id: status('todo').id, name: null, category: 'todo' } },
    });
  });

  it('stores everything from the quick-create modal', async () => {
    const { owner, ws, status, createTask } = await taskWorld(ctx);
    const sara = await createUser(ctx.db, { name: 'Sara K.' });
    await addMember(ctx.db, ws.id, sara.id);
    const tag = one(
      await ctx.db
        .insert(tags)
        .values({ workspaceId: ws.id, name: 'UX/UI', color: 'violet' })
        .returning(),
    );
    const description = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make it responsive' }] }],
    };

    const task = await createTask({
      title: '  Checkout page  ',
      description,
      statusId: status('done').id,
      priority: 'high',
      assigneeIds: [sara.id, sara.id],
      tagIds: [tag.id],
      startDate: '2026-10-01',
      dueDate: '2026-10-14',
    });
    expect(task).toMatchObject({
      title: 'Checkout page',
      description,
      descriptionText: 'Make it responsive',
      priority: 'high',
      startDate: '2026-10-01',
      dueDate: '2026-10-14',
      status: { id: status('done').id, category: 'done' },
      tags: [{ id: tag.id, name: 'UX/UI', color: 'violet' }],
      subtaskProgress: { done: 0, total: 0 },
      commentCount: 0,
      attachmentCount: 0,
    });
    expect(task.completedAt).not.toBeNull();
    expect(task.assignees.map((a) => a.id)).toEqual([sara.id]);
    expect(task.followers.map((f) => f.id).sort()).toEqual([owner.id, sara.id].sort());
  });

  it('rejects references outside the project or workspace', async () => {
    const world = await taskWorld(ctx);
    const other = await taskWorld(ctx);
    const stranger = await createUser(ctx.db);
    const otherWs = await createWorkspace(ctx.db, stranger.id);
    const foreignTag = one(
      await ctx.db
        .insert(tags)
        .values({ workspaceId: otherWs.id, name: 'X', color: 'blue' })
        .returning(),
    );
    const bodies = [
      { title: 'x', statusId: other.status('todo').id },
      { title: 'x', assigneeIds: [stranger.id] },
      { title: 'x', tagIds: [foreignTag.id] },
      { title: 'x', sprintId: foreignTag.id },
    ];
    for (const body of bodies) {
      const res = await world.api('POST', `/projects/${world.project.id}/tasks`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(errorCode(res)).toBe('INVALID_REFERENCE');
    }
    const blank = await world.api('POST', `/projects/${world.project.id}/tasks`, { title: '  ' });
    expect(blank.statusCode).toBe(400);
    // Nothing was created, so the numbering didn't move.
    expect((await world.createTask({ title: 'ok' })).number).toBe(1);
  });

  it('returns the full detail by id and by key', async () => {
    const { api, ws, project, createTask } = await taskWorld(ctx);
    const task = await createTask({ title: 'Find me' });
    for (const ref of [task.id, task.key, task.key.toLowerCase()]) {
      const res = await api('GET', `/tasks/${ref}`);
      expect(res.statusCode, ref).toBe(200);
      expect(taskDetailSchema.parse(res.json()).id).toBe(task.id);
    }
    const scoped = await api('GET', `/tasks/${task.key}?workspaceId=${ws.id}`);
    expect(scoped.statusCode).toBe(200);
    expect((await api('GET', `/tasks/${project.key}-999`)).statusCode).toBe(404);
    expect((await api('GET', '/tasks/not-a-key')).statusCode).toBe(404);
  });
});
