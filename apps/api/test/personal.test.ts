import {
  personalIndexSchema,
  personalItemSchema,
  personalTopicSchema,
  searchResultSchema,
  taskDetailSchema,
  type CreatePersonalItem,
} from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  personalItems,
  personalLinks,
  taskReferences,
  users,
  workspaceMembers,
} from '../src/db/schema/index.js';
import { purgeDeletedPersonalItems } from '../src/personal/service.js';
import { apiClient, createUser, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Api = ReturnType<typeof apiClient>;

const para = (...content: object[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const text = (t: string) => ({ type: 'text', text: t });
const itemLink = (id: string | null, title: string) => ({ type: 'itemLink', attrs: { id, title } });
const taskLink = (taskId: string, key: string) => ({ type: 'taskLink', attrs: { taskId, key } });

describe('personal space', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const index = async (api: Api) => {
    const res = await api('GET', '/me/personal');
    expect(res.statusCode, res.body).toBe(200);
    return personalIndexSchema.parse(res.json());
  };
  const create = async (api: Api, body: CreatePersonalItem) => {
    const res = await api('POST', '/me/personal/items', body);
    expect(res.statusCode, res.body).toBe(201);
    return personalItemSchema.parse(res.json());
  };
  const get = async (api: Api, id: string) => {
    const res = await api('GET', `/me/personal/items/${id}`);
    expect(res.statusCode, res.body).toBe(200);
    return personalItemSchema.parse(res.json());
  };
  const topic = async (api: Api, name: string, color = 'violet') => {
    const res = await api('POST', '/me/personal/topics', { name, color });
    expect(res.statusCode, res.body).toBe(201);
    return personalTopicSchema.parse(res.json());
  };

  it('creates topics, notes and to-dos, newest item first', async () => {
    const w = await taskWorld(ctx);
    const work = await topic(w.api, 'Work');
    const home = await topic(w.api, 'Home', 'teal');
    const dup = await w.api('POST', '/me/personal/topics', { name: 'work', color: 'blue' });
    expect(dup.statusCode).toBe(409);
    expect(errorCode(dup)).toBe('TOPIC_EXISTS');

    const note = await create(w.api, { title: 'Ideas', topicId: work.id });
    const todo = await create(w.api, { kind: 'todo', title: 'Buy milk', dueDate: '2026-11-20' });
    expect(todo).toMatchObject({
      kind: 'todo',
      dueDate: '2026-11-20',
      doneAt: null,
      topicId: null,
    });

    const idx = await index(w.api);
    expect(idx.topics.map((t) => t.name)).toEqual(['Work', 'Home']);
    expect(idx.items.map((i) => i.title)).toEqual(['Buy milk', 'Ideas']);
    expect(idx.items[1]).toMatchObject({ id: note.id, topicId: work.id });

    // Reorder topics and items.
    const moved = await w.api('POST', `/me/personal/topics/${home.id}/move`, { nextId: work.id });
    expect(moved.statusCode, moved.body).toBe(200);
    const movedItem = await w.api('POST', `/me/personal/items/${todo.id}/move`, {
      prevId: note.id,
    });
    expect(movedItem.statusCode, movedItem.body).toBe(200);
    const after = await index(w.api);
    expect(after.topics.map((t) => t.name)).toEqual(['Home', 'Work']);
    expect(after.items.map((i) => i.title)).toEqual(['Ideas', 'Buy milk']);

    // Done toggles; deleting a topic keeps its items under "No topic".
    const done = await w.api('PATCH', `/me/personal/items/${todo.id}`, { done: true });
    expect(personalItemSchema.parse(done.json()).doneAt).not.toBeNull();
    expect((await w.api('DELETE', `/me/personal/topics/${work.id}`)).statusCode).toBe(204);
    expect((await get(w.api, note.id)).topicId).toBeNull();
  });

  it('keeps everything private to its owner', async () => {
    const w = await taskWorld(ctx);
    const admin = await w.person('owner', 'Bat Admin');
    const t = await topic(w.api, 'Secret topic');
    const item = await create(w.api, { title: 'Secret note', topicId: t.id });

    // Someone else, even an owner of a shared workspace, sees nothing and can touch nothing.
    for (const api of [admin.api]) {
      expect((await index(api)).items).toEqual([]);
      const calls: [string, string, object?][] = [
        ['GET', `/me/personal/items/${item.id}`],
        ['PATCH', `/me/personal/items/${item.id}`, { title: 'Mine now' }],
        ['POST', `/me/personal/items/${item.id}/move`, {}],
        ['DELETE', `/me/personal/items/${item.id}`],
        ['POST', `/me/personal/items/${item.id}/restore`],
        ['PATCH', `/me/personal/topics/${t.id}`, { name: 'x' }],
        ['POST', `/me/personal/topics/${t.id}/move`, {}],
        ['DELETE', `/me/personal/topics/${t.id}`],
      ];
      for (const [method, path, body] of calls) {
        const res = await api(method as 'GET', path, body);
        expect(res.statusCode, `${method} ${path}`).toBe(404);
        expect(errorCode(res)).toBe('NOT_FOUND');
      }
      // Their own item can't be filed under my topic, and linking my item keeps only the title.
      const foreignTopic = await api('POST', '/me/personal/items', { title: 'x', topicId: t.id });
      expect(errorCode(foreignTopic)).toBe('INVALID_REFERENCE');
      const theirs = await create(api, { title: 'Theirs', body: para(itemLink(item.id, 'Guess')) });
      const [row] = await ctx.db
        .select()
        .from(personalLinks)
        .where(eq(personalLinks.sourceItemId, theirs.id));
      expect(row).toMatchObject({ targetItemId: null, title: 'Guess' });
      // My item gains no backlink from their note.
      expect((await get(w.api, item.id)).backlinks).toEqual([]);
    }
    expect((await get(w.api, item.id)).title).toBe('Secret note');

    // The platform admin has no personal space.
    const vade = await createUser(ctx.db, { name: 'Vade' });
    await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, vade.id));
    const vadeApi = apiClient(ctx.app, await login(ctx.app, vade.email));
    expect((await vadeApi('GET', '/me/personal')).statusCode).toBe(404);
    expect((await vadeApi('GET', `/me/personal/items/${item.id}`)).statusCode).toBe(404);
  });

  it('syncs links, resolves titles and lists backlinks', async () => {
    const w = await taskWorld(ctx);
    const ideas = await create(w.api, { title: 'Ideas' });
    const plan = await create(w.api, {
      title: 'Plan',
      body: para(
        text('See '),
        itemLink(ideas.id, 'Ideas'),
        text(' and '),
        itemLink(null, 'Someday'),
      ),
    });
    expect((await get(w.api, ideas.id)).backlinks).toEqual([
      { id: plan.id, kind: 'note', title: 'Plan' },
    ]);
    let idx = await index(w.api);
    expect(idx.links).toEqual([
      { sourceId: plan.id, targetItemId: ideas.id, targetTaskId: null, title: 'Ideas' },
      { sourceId: plan.id, targetItemId: null, targetTaskId: null, title: 'Someday' },
    ]);

    // Renaming keeps the picked link; creating "someday" makes the title link live.
    await w.api('PATCH', `/me/personal/items/${ideas.id}`, { title: 'Big ideas' });
    expect((await get(w.api, ideas.id)).backlinks.map((b) => b.id)).toEqual([plan.id]);
    const someday = await create(w.api, { title: 'someday' });
    expect((await get(w.api, someday.id)).backlinks.map((b) => b.id)).toEqual([plan.id]);

    // Editing the body rebuilds the rows; a no-op save writes nothing.
    await w.api('PATCH', `/me/personal/items/${plan.id}`, { body: para(text('nothing')) });
    expect((await get(w.api, ideas.id)).backlinks).toEqual([]);
    idx = await index(w.api);
    expect(idx.links).toEqual([]);
    const before = (await get(w.api, plan.id)).updatedAt;
    await w.api('PATCH', `/me/personal/items/${plan.id}`, { body: para(text('nothing')) });
    expect((await get(w.api, plan.id)).updatedAt).toBe(before);

    // Body text is searchable plain text.
    const [row] = await ctx.db.select().from(personalItems).where(eq(personalItems.id, plan.id));
    expect(row?.bodyText).toBe('nothing');
  });

  it('soft-deletes with restore, and purges after 30 days keeping links by title', async () => {
    const w = await taskWorld(ctx);
    const target = await create(w.api, { title: 'Target' });
    const source = await create(w.api, {
      title: 'Source',
      body: para(itemLink(target.id, 'Target')),
    });
    expect((await w.api('DELETE', `/me/personal/items/${target.id}`)).statusCode).toBe(204);
    expect((await w.api('GET', `/me/personal/items/${target.id}`)).statusCode).toBe(404);
    expect((await index(w.api)).items.map((i) => i.id)).toEqual([source.id]);
    expect((await w.api('POST', `/me/personal/items/${target.id}/restore`)).statusCode).toBe(200);
    expect((await get(w.api, target.id)).backlinks.map((b) => b.id)).toEqual([source.id]);
    expect((await w.api('POST', `/me/personal/items/${source.id}/restore`)).statusCode).toBe(404);

    await w.api('DELETE', `/me/personal/items/${target.id}`);
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await purgeDeletedPersonalItems(ctx.db, later)).toBeGreaterThanOrEqual(1);
    const [link] = await ctx.db
      .select()
      .from(personalLinks)
      .where(eq(personalLinks.sourceItemId, source.id));
    expect(link).toMatchObject({ targetItemId: null, title: 'Target' });
  });

  it('links team tasks one way, only ones I can see', async () => {
    const w = await taskWorld(ctx);
    const task = await w.createTask({ title: 'Ship it' });
    const other = await taskWorld(ctx, 'Dorj Other');
    const foreign = await other.createTask({ title: 'Not mine' });

    const bad = await w.api('POST', '/me/personal/items', {
      title: 'x',
      body: para(taskLink(foreign.id, foreign.key)),
    });
    expect(bad.statusCode).toBe(400);
    expect(errorCode(bad)).toBe('INVALID_TASK');

    const note = await create(w.api, {
      title: 'Ship notes',
      body: para(text('About '), taskLink(task.id, task.key)),
    });
    const idx = await index(w.api);
    expect(idx.tasks).toEqual([
      {
        id: task.id,
        key: task.key,
        title: 'Ship it',
        closed: false,
        workspaceId: w.ws.id,
        workspaceSlug: w.ws.slug,
      },
    ]);

    // The team task shows nothing about the note.
    const detail = taskDetailSchema.parse((await w.api('GET', `/tasks/${task.id}`)).json());
    expect(detail.mentionedIn).toEqual([]);
    expect(
      await ctx.db.select().from(taskReferences).where(eq(taskReferences.targetTaskId, task.id)),
    ).toEqual([]);
    const search = searchResultSchema.parse(
      (await w.api('GET', `/workspaces/${w.ws.id}/search?q=Ship`)).json(),
    );
    expect(JSON.stringify(search)).not.toContain('Ship notes');

    // Leaving the workspace makes the task unavailable, and the note still saves.
    await ctx.db
      .update(workspaceMembers)
      .set({ deactivatedAt: new Date() })
      .where(
        and(eq(workspaceMembers.workspaceId, w.ws.id), eq(workspaceMembers.userId, w.owner.id)),
      );
    expect((await index(w.api)).tasks).toEqual([]);
    const save = await w.api('PATCH', `/me/personal/items/${note.id}`, {
      body: para(text('Still about '), taskLink(task.id, task.key)),
    });
    expect(save.statusCode, save.body).toBe(200);
  });

  it('refuses personal link nodes in team content', async () => {
    const w = await taskWorld(ctx);
    const res = await w.api('POST', `/projects/${w.project.id}/tasks`, {
      title: 'x',
      description: para(itemLink(null, 'Private')),
    });
    expect(res.statusCode).toBe(400);
  });

  it('tells only the owner, with no content', async () => {
    const w = await taskWorld(ctx);
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      const item = await create(w.api, { title: 'Quiet' });
      await w.api('PATCH', `/me/personal/items/${item.id}`, { title: 'Quiet' }); // no-op
      await w.api('PATCH', `/me/personal/items/${item.id}`, { title: 'Loud' });
      const sent = publish.mock.calls
        .map(([envelope]) => envelope)
        .filter((e) => e.message.type === 'personal.changed');
      expect(sent).toHaveLength(2);
      for (const e of sent) {
        expect(e.to).toEqual({ userId: w.owner.id, anyWorkspace: true });
        expect(e.message).toEqual({ type: 'personal.changed' });
      }
    } finally {
      publish.mockRestore();
    }
  });
});
