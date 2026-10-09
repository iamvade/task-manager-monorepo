import { commentSchema, taskFollowersSchema, type RichTextNode } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DomainEvent } from '../src/events/bus.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Part = string | { id: string; label?: string };

/** A one-paragraph TipTap doc; objects become mention nodes. */
const doc = (...parts: Part[]): RichTextNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: parts.map((p) =>
        typeof p === 'string'
          ? { type: 'text', text: p }
          : { type: 'mention', attrs: { id: p.id, label: p.label ?? 'Someone' } },
      ),
    },
  ],
});

describe('comments', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const seen: DomainEvent[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.app.events.on('*', (event) => {
      seen.push(event);
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const task = await w.createTask({ title: 'Checkout page' });
    const sara = await w.person('member', 'Sara Khan');
    const dorj = await w.person('member', 'Dorj Enkh');
    const comment = async (api: typeof w.api, body: RichTextNode, parentId?: string) => {
      const res = await api('POST', `/tasks/${task.id}/comments`, { body, parentId });
      expect(res.statusCode, res.body).toBe(201);
      return commentSchema.parse(res.json());
    };
    const threads = async () => {
      const res = await w.api('GET', `/tasks/${task.id}/comments`);
      expect(res.statusCode, res.body).toBe(200);
      return z.array(commentSchema).parse(res.json());
    };
    const followerIds = async () => {
      const res = await w.api('POST', `/tasks/${task.id}/follow`);
      const ids = taskFollowersSchema.parse(res.json()).followers.map((f) => f.id);
      return ids;
    };
    return { ...w, task, sara, dorj, comment, threads, followerIds };
  }

  it('extracts mentions and plain text; author and mentioned members follow', async () => {
    const { owner, task, sara, dorj, person, comment, activities, followerIds } = await world();
    const { user: outsider } = await person(null, 'Out Sider');

    const c = await comment(
      sara.api,
      doc(
        'Heads up ',
        { id: dorj.user.id, label: 'Dorj E.' },
        ' and ',
        { id: outsider.id, label: 'Out S.' },
        ' ',
        { id: dorj.user.id, label: 'Dorj E.' },
      ),
    );
    expect(c).toMatchObject({
      author: { id: sara.user.id, name: 'Sara Khan' },
      parentId: null,
      bodyText: 'Heads up @Dorj E. and @Out S. @Dorj E.',
      editedAt: null,
      replies: [],
    });

    // The outsider is ignored; Dorj follows; the owner follows as creator.
    expect((await followerIds()).sort()).toEqual([owner.id, sara.user.id, dorj.user.id].sort());

    const [added] = (await activities(task.id)).filter((a) => a.type === 'comment.added');
    expect(added).toMatchObject({ actorId: sara.user.id, payload: { commentId: c.id } });

    const event = seen.find((e) => e.type === 'comment.created' && e.commentId === c.id);
    expect(event).toMatchObject({ actorId: sara.user.id, mentionedUserIds: [dorj.user.id] });
  });

  it('rejects empty and invalid bodies', async () => {
    const { api, task } = await world();
    const post = (body: unknown) => api('POST', `/tasks/${task.id}/comments`, { body });
    let res = await post(doc('   '));
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('EMPTY_COMMENT');
    res = await post({ type: 'paragraph', content: [] });
    expect(res.statusCode).toBe(400);
    res = await post('hello');
    expect(res.statusCode).toBe(400);
  });

  it('threads replies one level deep', async () => {
    const { api, task, sara, dorj, comment, threads, createTask } = await world();
    const root = await comment(sara.api, doc('Promo codes up to 24 chars'));
    const reply = await comment(dorj.api, doc('On it'), root.id);
    // A reply to a reply joins the root's thread.
    const nested = await comment(api, doc('Thanks'), reply.id);
    expect(nested.parentId).toBe(root.id);
    const second = await comment(api, doc('Second thread'));

    const list = await threads();
    expect(list.map((c) => c.id)).toEqual([root.id, second.id]);
    expect(list[0]?.replies.map((r) => [r.id, r.parentId])).toEqual([
      [reply.id, root.id],
      [nested.id, root.id],
    ]);

    // Parent must be a live comment of the same task.
    const other = await createTask({ title: 'Other' });
    const elsewhere = await api('POST', `/tasks/${other.id}/comments`, { body: doc('x') });
    const otherId = commentSchema.parse(elsewhere.json()).id;
    let res = await api('POST', `/tasks/${task.id}/comments`, {
      body: doc('x'),
      parentId: otherId,
    });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_PARENT');
    await api('DELETE', `/comments/${second.id}`);
    res = await api('POST', `/tasks/${task.id}/comments`, { body: doc('x'), parentId: second.id });
    expect(errorCode(res)).toBe('INVALID_PARENT');
  });

  it('lets only the author edit; edits set editedAt and report only new mentions', async () => {
    const { owner, sara, dorj, comment, followerIds } = await world();
    const c = await comment(sara.api, doc('Ping ', { id: dorj.user.id }));

    let res = await dorj.api('PATCH', `/comments/${c.id}`, { body: doc('hijack') });
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');

    // Unchanged body: no-op.
    res = await sara.api('PATCH', `/comments/${c.id}`, {
      body: doc('Ping ', { id: dorj.user.id }),
    });
    expect(commentSchema.parse(res.json()).editedAt).toBeNull();

    const before = seen.length;
    res = await sara.api('PATCH', `/comments/${c.id}`, {
      body: doc('Ping ', { id: dorj.user.id }, ' and ', { id: owner.id }),
    });
    expect(res.statusCode, res.body).toBe(200);
    const edited = commentSchema.parse(res.json());
    expect(edited.editedAt).not.toBeNull();
    expect(edited.bodyText).toBe('Ping @Someone and @Someone');
    const events = seen.slice(before).filter((e) => e.type === 'comment.updated');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ commentId: c.id, mentionedUserIds: [owner.id] });
    expect(await followerIds()).toContain(dorj.user.id);

    res = await sara.api('PATCH', `/comments/${c.id}`, { body: doc('  ') });
    expect(errorCode(res)).toBe('EMPTY_COMMENT');
  });

  it('lets the author or an admin delete; others get 403', async () => {
    const { api, sara, dorj, person, comment, threads, activities, task } = await world();
    const admin = await person('admin', 'Ada Admin');
    const a = await comment(sara.api, doc('A'));
    const b = await comment(sara.api, doc('B'));
    const c = await comment(sara.api, doc('C'));

    let res = await dorj.api('DELETE', `/comments/${a.id}`);
    expect(res.statusCode).toBe(403);
    expect((await sara.api('DELETE', `/comments/${a.id}`)).statusCode).toBe(204);
    expect((await admin.api('DELETE', `/comments/${b.id}`)).statusCode).toBe(204);
    // The workspace owner counts as admin.
    expect((await api('DELETE', `/comments/${c.id}`)).statusCode).toBe(204);
    expect(await threads()).toEqual([]);

    // Gone for good: no edits, no second delete.
    res = await sara.api('PATCH', `/comments/${a.id}`, { body: doc('back') });
    expect(res.statusCode).toBe(404);
    expect((await sara.api('DELETE', `/comments/${a.id}`)).statusCode).toBe(404);

    // comment.added rows stay (they date the comment); deletes log nothing.
    expect((await activities(task.id)).filter((x) => x.type === 'comment.added')).toHaveLength(3);
  });

  it('keeps a deleted comment with replies as a tombstone', async () => {
    const { sara, dorj, comment, threads } = await world();
    const root = await comment(sara.api, doc('Root'));
    const r1 = await comment(dorj.api, doc('Reply 1'), root.id);
    const r2 = await comment(dorj.api, doc('Reply 2'), root.id);
    await dorj.api('DELETE', `/comments/${r1.id}`);
    await sara.api('DELETE', `/comments/${root.id}`);

    const [tomb] = await threads();
    expect(tomb).toMatchObject({ id: root.id, body: null, bodyText: '' });
    expect(tomb?.deletedAt).not.toBeNull();
    expect(tomb?.replies.map((r) => r.id)).toEqual([r2.id]);

    await dorj.api('DELETE', `/comments/${r2.id}`);
    expect(await threads()).toEqual([]);
  });

  it('answers 404 to outsiders and on deleted tasks', async () => {
    const { api, task, person, comment } = await world();
    const c = await comment(api, doc('Mine'));
    const { api: outsider } = await person(null);
    expect((await outsider('GET', `/tasks/${task.id}/comments`)).statusCode).toBe(404);
    expect(
      (await outsider('POST', `/tasks/${task.id}/comments`, { body: doc('x') })).statusCode,
    ).toBe(404);
    expect((await outsider('PATCH', `/comments/${c.id}`, { body: doc('x') })).statusCode).toBe(404);
    expect((await outsider('DELETE', `/comments/${c.id}`)).statusCode).toBe(404);

    await api('DELETE', `/tasks/${task.id}`);
    expect((await api('GET', `/tasks/${task.id}/comments`)).statusCode).toBe(404);
    expect((await api('PATCH', `/comments/${c.id}`, { body: doc('x') })).statusCode).toBe(404);
  });
});
