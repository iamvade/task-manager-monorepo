import { readFileSync } from 'node:fs';
import { tagSchema, tagWithUsageSchema } from '@kite/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { tags, taskTags } from '../src/db/schema/index.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('workspace tags', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function setup() {
    const w = await taskWorld(ctx);
    const tag = async (name: string, color = 'blue') => {
      const res = await w.api('POST', `/workspaces/${w.ws.id}/tags`, { name, color });
      expect(res.statusCode, res.body).toBe(201);
      return tagSchema.parse(res.json());
    };
    const listTags = async () =>
      z.array(tagWithUsageSchema).parse((await w.api('GET', `/workspaces/${w.ws.id}/tags`)).json());
    return { ...w, tag, listTags };
  }

  it('treats names as unique regardless of case', async () => {
    const { ws, api, tag } = await setup();
    const bug = await tag('Bug');
    const dup = await api('POST', `/workspaces/${ws.id}/tags`, { name: 'bug', color: 'rose' });
    expect(dup.statusCode).toBe(409);
    expect(errorCode(dup)).toBe('TAG_EXISTS');
    const other = await tag('Feature');
    const rename = await api('PATCH', `/tags/${other.id}`, { name: 'BUG' });
    expect(rename.statusCode).toBe(409);
    // Changing only the case of its own name is fine.
    const recased = await api('PATCH', `/tags/${bug.id}`, { name: 'bug' });
    expect(recased.json()).toMatchObject({ name: 'bug' });
  });

  it('lists tags case-insensitively by name with their live task counts', async () => {
    const { createTask, api, tag, listTags } = await setup();
    const ux = await tag('ux');
    const api_ = await tag('API');
    await tag('Unused');
    const a = await createTask({ title: 'A', tagIds: [ux.id, api_.id] });
    await createTask({ title: 'B', tagIds: [ux.id] });
    const gone = await createTask({ title: 'C', tagIds: [ux.id] });
    expect((await api('DELETE', `/tasks/${gone.id}`)).statusCode).toBe(204);

    const list = await listTags();
    expect(list.map((t) => [t.name, t.taskCount])).toEqual([
      ['API', 1],
      ['Unused', 0],
      ['ux', 2],
    ]);
    expect(a.tags.map((t) => t.name).sort()).toEqual(['API', 'ux']);
  });

  it('merges a tag into another, keeping each task once', async () => {
    const { api, createTask, tag, listTags } = await setup();
    const from = await tag('Bugs');
    const into = await tag('Bug', 'rose');
    const both = await createTask({ title: 'Both', tagIds: [from.id, into.id] });
    const onlyFrom = await createTask({ title: 'Only from', tagIds: [from.id] });
    await createTask({ title: 'Only into', tagIds: [into.id] });

    const res = await api('POST', `/tags/${from.id}/merge`, { intoTagId: into.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(tagWithUsageSchema.parse(res.json())).toEqual({
      id: into.id,
      name: 'Bug',
      color: 'rose',
      taskCount: 3,
    });
    expect((await listTags()).map((t) => t.name)).toEqual(['Bug']);
    const rows = await ctx.db.select().from(taskTags).where(eq(taskTags.tagId, into.id));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.taskId)).toEqual(expect.arrayContaining([both.id, onlyFrom.id]));

    const self = await api('POST', `/tags/${into.id}/merge`, { intoTagId: into.id });
    expect(self.statusCode).toBe(400);
    expect(errorCode(self)).toBe('INVALID_REFERENCE');
    const missing = await api('POST', `/tags/${into.id}/merge`, { intoTagId: from.id });
    expect(errorCode(missing)).toBe('INVALID_REFERENCE');
  });

  it('refuses to merge into a tag of another workspace', async () => {
    const mine = await setup();
    const theirs = await setup();
    const a = await mine.tag('Mine');
    const b = await theirs.tag('Theirs');
    const res = await mine.api('POST', `/tags/${a.id}/merge`, { intoTagId: b.id });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_REFERENCE');
    // And the other workspace's tag can't be the source either.
    const back = await mine.api('POST', `/tags/${b.id}/merge`, { intoTagId: a.id });
    expect(back.statusCode).toBe(404);
  });

  it('keeps tag management to admins and owners', async () => {
    const { ws, tag, person } = await setup();
    const t = await tag('Ops');
    const member = await person('member');
    const admin = await person('admin', 'Bat Admin');
    expect((await member.api('GET', `/workspaces/${ws.id}/tags`)).statusCode).toBe(200);
    for (const res of [
      await member.api('POST', `/workspaces/${ws.id}/tags`, { name: 'X', color: 'blue' }),
      await member.api('PATCH', `/tags/${t.id}`, { color: 'green' }),
      await member.api('DELETE', `/tags/${t.id}`),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
    }
    const created = await admin.api('POST', `/workspaces/${ws.id}/tags`, {
      name: 'X',
      color: 'blue',
    });
    expect(created.statusCode).toBe(201);
  });

  it('tells the workspace when tags change, except the tab that changed them', async () => {
    const { ws, api, tag } = await setup();
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      const a = await tag('One');
      const b = await tag('Two');
      await api('PATCH', `/tags/${a.id}`, { color: 'teal' });
      await api('POST', `/tags/${a.id}/merge`, { intoTagId: b.id });
      await api('DELETE', `/tags/${b.id}`);
      const sent = publish.mock.calls
        .map(([envelope]) => envelope)
        .filter((e) => e.message.type === 'tags.changed');
      expect(sent).toHaveLength(5);
      for (const e of sent) {
        expect(e.to).toEqual({ workspaceId: ws.id });
        expect(e.message).toMatchObject({ workspaceId: ws.id });
      }
    } finally {
      publish.mockRestore();
    }
  });

  it('migration 0014 merges existing case-duplicates into the oldest tag', async () => {
    const { ws, createTask } = await setup();
    const migration = readFileSync(
      new URL('../drizzle/0014_tags_ci_unique.sql', import.meta.url),
      'utf8',
    );
    // The merge statements only: the constraint swap already ran.
    const statements = migration
      .split('--> statement-breakpoint')
      .filter((s) => !/DROP CONSTRAINT|CREATE UNIQUE INDEX/.test(s));
    // Tasks first: the API's own connection would wait on the transaction's lock on tags.
    const t1 = await createTask({ title: 'T1' });
    const t2 = await createTask({ title: 'T2' });
    const rollback = new Error('rollback');
    await expect(
      ctx.db.transaction(async (tx) => {
        await tx.execute(sql`DROP INDEX tags_workspace_id_lower_name_unique`);
        const [oldest, newer, other] = await tx
          .insert(tags)
          .values([
            { workspaceId: ws.id, name: 'Bug', color: 'rose' },
            { workspaceId: ws.id, name: 'bug', color: 'blue' },
            { workspaceId: ws.id, name: 'Feature', color: 'green' },
          ])
          .returning();
        if (!oldest || !newer || !other) throw new Error('expected 3 tags');
        await tx.insert(taskTags).values([
          { taskId: t1.id, tagId: oldest.id },
          { taskId: t1.id, tagId: newer.id },
          { taskId: t2.id, tagId: newer.id },
        ]);
        for (const s of statements) await tx.execute(sql.raw(s));

        const left = await tx.select().from(tags).where(eq(tags.workspaceId, ws.id));
        expect(left.map((t) => t.name).sort()).toEqual(['Bug', 'Feature']);
        const carried = await tx.select().from(taskTags).where(eq(taskTags.tagId, oldest.id));
        expect(carried.map((r) => r.taskId).sort()).toEqual([t1.id, t2.id].sort());
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
