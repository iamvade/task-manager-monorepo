import {
  commentSchema,
  meResponseSchema,
  notificationPageSchema,
  readAllResultSchema,
  sidebarResponseSchema,
  type InboxTab,
  type RichTextNode,
} from '@kite/shared';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications, workspaceMembers } from '../src/db/schema/index.js';
import { archiveReadNotifications } from '../src/notifications/archive-job.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Part = string | { id: string };

/** A one-paragraph TipTap doc; objects become mention nodes. */
const doc = (...parts: Part[]): RichTextNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: parts.map((p) =>
        typeof p === 'string'
          ? { type: 'text', text: p }
          : { type: 'mention', attrs: { id: p.id, label: 'Someone' } },
      ),
    },
  ],
});

describe('notifications', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const sara = await w.person('member', 'Sara Khan');
    const dorj = await w.person('member', 'Dorj Enkh');
    /** A request that must answer `expected`; waits for the notifier afterwards. */
    const call = async (
      client: typeof w.api,
      method: Parameters<typeof w.api>[0],
      path: string,
      payload?: object,
      expected = 200,
    ) => {
      const res = await client(method, path, payload);
      expect(res.statusCode, res.body).toBe(expected);
      await ctx.app.events.idle();
      return res;
    };
    const createTask = async (...args: Parameters<typeof w.createTask>) => {
      const task = await w.createTask(...args);
      await ctx.app.events.idle();
      return task;
    };
    const comment = (client: typeof w.api, taskId: string, body: RichTextNode) =>
      call(client, 'POST', `/tasks/${taskId}/comments`, { body }, 201);
    /** A user's notification rows, oldest first. */
    const rows = (userId: string) =>
      ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(asc(notifications.createdAt), asc(notifications.id));
    const inbox = async (client: typeof w.api, tab: InboxTab = 'all', extra = '') => {
      const res = await client(
        'GET',
        `/me/notifications?workspaceId=${w.ws.id}&tab=${tab}${extra}`,
      );
      expect(res.statusCode, res.body).toBe(200);
      return notificationPageSchema.parse(res.json());
    };
    return { ...w, sara, dorj, call, createTask, comment, rows, inbox };
  }

  describe('fan-out', () => {
    it('notifies mentions and followers of a comment, never the author', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'Checkout page' });
      await w.comment(w.sara.api, task.id, doc('Ready? ', { id: w.dorj.user.id }, ' please check'));

      expect((await w.rows(w.owner.id)).map((n) => n.type)).toEqual(['comment']);
      expect((await w.rows(w.dorj.user.id)).map((n) => n.type)).toEqual(['mention']);
      expect(await w.rows(w.sara.user.id)).toEqual([]);

      const [item] = (await w.inbox(w.dorj.api)).items;
      expect(item).toMatchObject({
        type: 'mention',
        task: { id: task.id, key: task.key, title: 'Checkout page' },
        project: { id: w.project.id, name: w.project.name },
        actor: { id: w.sara.user.id, name: 'Sara Khan' },
        activity: { type: 'comment.added', actor: { id: w.sara.user.id } },
        snippet: 'Ready? @Someone please check',
        readAt: null,
      });
    });

    it('notifies members mentioned in a description, on create and on later edits', async () => {
      const w = await world();
      const task = await w.createTask({
        title: 'Spec',
        description: doc('Owner: ', { id: w.sara.user.id }),
      });
      const [created] = await w.rows(w.sara.user.id);
      expect(created).toMatchObject({ type: 'mention', actorId: w.owner.id });

      await w.call(w.api, 'PATCH', `/tasks/${task.id}`, {
        description: doc('Owner: ', { id: w.sara.user.id }, ' and ', { id: w.dorj.user.id }),
      });
      // Sara was already mentioned; only Dorj is new.
      expect(await w.rows(w.sara.user.id)).toHaveLength(1);
      const [item] = (await w.inbox(w.dorj.api, 'mentions')).items;
      expect(item?.activity?.type).toBe('description.changed');
      expect(item?.snippet).toBe('Owner: @Someone and @Someone');
    });

    it('notifies a mention added by editing a comment, pointing at the comment', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      const res = await w.comment(w.sara.api, task.id, doc('first draft'));
      const commentId = commentSchema.parse(res.json()).id;
      await w.call(w.sara.api, 'PATCH', `/comments/${commentId}`, {
        body: doc('cc ', { id: w.dorj.user.id }),
      });
      const [item] = (await w.inbox(w.dorj.api)).items;
      expect(item).toMatchObject({
        type: 'mention',
        activity: { type: 'comment.added', payload: { commentId } },
        snippet: 'cc @Someone',
      });
    });

    it('notifies new assignees on create and on assignee changes', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T', assigneeIds: [w.owner.id, w.sara.user.id] });
      expect((await w.rows(w.sara.user.id)).map((n) => n.type)).toEqual(['assigned']);
      expect(await w.rows(w.owner.id)).toEqual([]);

      await w.call(w.api, 'PUT', `/tasks/${task.id}/assignees`, {
        userIds: [w.sara.user.id, w.dorj.user.id],
      });
      const [item] = (await w.inbox(w.dorj.api, 'assigned')).items;
      expect(item).toMatchObject({
        type: 'assigned',
        activity: { type: 'assignee.added', payload: { user: { id: w.dorj.user.id } } },
        snippet: null,
      });
      // Sara stays assigned: nothing new.
      expect(await w.rows(w.sara.user.id)).toHaveLength(1);
    });

    it('notifies followers of status changes from edits, moves and completion', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      await w.call(w.dorj.api, 'POST', `/tasks/${task.id}/follow`);

      await w.call(w.api, 'PATCH', `/tasks/${task.id}`, { statusId: w.status('in_progress').id });
      const [first] = await w.rows(w.dorj.user.id);
      expect(first).toMatchObject({ type: 'status', actorId: w.owner.id });

      // Within 5 minutes and unread: the same row, now pointing at the latest change.
      await w.call(w.api, 'POST', `/tasks/${task.id}/move`, { statusId: w.status('review').id });
      await w.call(w.api, 'POST', `/tasks/${task.id}/complete`);
      const collapsed = await w.rows(w.dorj.user.id);
      expect(collapsed).toHaveLength(1);
      expect(collapsed[0]?.id).toBe(first?.id);
      const [item] = (await w.inbox(w.dorj.api)).items;
      expect(item?.activity).toMatchObject({
        type: 'status.changed',
        payload: { from: { category: 'review' }, to: { category: 'done' } },
      });

      // Reorders and other edits don't notify.
      await w.call(w.api, 'POST', `/tasks/${task.id}/move`, { statusId: w.status('done').id });
      await w.call(w.api, 'PATCH', `/tasks/${task.id}`, { priority: 'high' });
      expect(await w.rows(w.dorj.user.id)).toHaveLength(1);
    });

    it('starts a new notification once the old one is read or older than 5 minutes', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      await w.call(w.dorj.api, 'POST', `/tasks/${task.id}/follow`);
      const setStatus = (category: 'todo' | 'in_progress' | 'review') =>
        w.call(w.api, 'PATCH', `/tasks/${task.id}`, { statusId: w.status(category).id });

      await setStatus('in_progress');
      const [first] = await w.rows(w.dorj.user.id);
      if (!first) throw new Error('no notification');
      await ctx.db
        .update(notifications)
        .set({ createdAt: new Date(first.createdAt.getTime() - 6 * 60_000) })
        .where(eq(notifications.id, first.id));
      await setStatus('review');
      expect(await w.rows(w.dorj.user.id)).toHaveLength(2);

      const second = (await w.rows(w.dorj.user.id))[1];
      await w.call(w.dorj.api, 'POST', `/me/notifications/${second?.id}/read`, undefined, 204);
      await setStatus('todo');
      expect(await w.rows(w.dorj.user.id)).toHaveLength(3);
    });

    it('collapses per type: a status change and a comment stay separate', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      await w.call(w.dorj.api, 'POST', `/tasks/${task.id}/follow`);
      await w.call(w.api, 'PATCH', `/tasks/${task.id}`, { statusId: w.status('in_progress').id });
      await w.comment(w.api, task.id, doc('one'));
      await w.comment(w.sara.api, task.id, doc('two'));
      const rows = await w.rows(w.dorj.user.id);
      expect(rows.map((n) => n.type)).toEqual(['status', 'comment']);
      expect(rows[1]?.actorId).toBe(w.sara.user.id);
      expect((await w.inbox(w.dorj.api)).items[0]?.snippet).toBe('two');
    });

    it('respects preferences, falling back to the next enabled type', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      await w.call(w.dorj.api, 'POST', `/tasks/${task.id}/follow`);
      const prefs = await w.call(w.dorj.api, 'PATCH', '/me', {
        notificationPrefs: { mention: false },
      });
      expect(meResponseSchema.parse(prefs.json()).preferences).toMatchObject({
        notificationPrefs: { mention: false, assigned: true, comment: true, status: true },
      });

      await w.comment(w.sara.api, task.id, doc('hey ', { id: w.dorj.user.id }));
      expect((await w.rows(w.dorj.user.id)).map((n) => n.type)).toEqual(['comment']);

      await w.call(w.dorj.api, 'PATCH', '/me', { notificationPrefs: { comment: false } });
      await w.call(w.dorj.api, 'POST', '/me/notifications/read-all', { workspaceId: w.ws.id });
      await w.comment(w.sara.api, task.id, doc('again ', { id: w.dorj.user.id }));
      expect(await w.rows(w.dorj.user.id)).toHaveLength(1);
    });

    it('skips people who are no longer workspace members', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T' });
      await w.call(w.dorj.api, 'POST', `/tasks/${task.id}/follow`);
      await ctx.db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, w.ws.id),
            eq(workspaceMembers.userId, w.dorj.user.id),
          ),
        );
      await w.comment(w.sara.api, task.id, doc('anyone?'));
      expect(await w.rows(w.dorj.user.id)).toEqual([]);
      expect((await w.rows(w.owner.id)).map((n) => n.type)).toEqual(['comment']);
    });
  });

  describe('inbox', () => {
    it('lists by tab with cursor pages and counts matching the sidebar', async () => {
      const w = await world();
      // Five tasks, one notification each for Sara: 2 assigned, 2 mentions, 1 comment.
      const a1 = await w.createTask({ title: 'A1', assigneeIds: [w.sara.user.id] });
      const a2 = await w.createTask({ title: 'A2', assigneeIds: [w.sara.user.id] });
      const m1 = await w.createTask({ title: 'M1' });
      await w.comment(w.api, m1.id, doc('hi ', { id: w.sara.user.id }));
      const m2 = await w.createTask({ title: 'M2', description: doc({ id: w.sara.user.id }) });
      await w.comment(w.api, a1.id, doc('note'));
      await ctx.app.events.idle();

      const all = await w.inbox(w.sara.api);
      // a1 got two (assigned, then comment), so newest first: a1 comment, m2, m1, a2, a1.
      expect(all.items.map((n) => [n.task.title, n.type])).toEqual([
        ['A1', 'comment'],
        ['M2', 'mention'],
        ['M1', 'mention'],
        ['A2', 'assigned'],
        ['A1', 'assigned'],
      ]);
      expect(all.counts).toEqual({ unread: 5, archived: 0 });
      expect(all.nextCursor).toBeNull();

      const p1 = await w.inbox(w.sara.api, 'all', '&limit=2');
      expect(p1.items.map((n) => n.task.title)).toEqual(['A1', 'M2']);
      const p2 = await w.inbox(w.sara.api, 'all', `&limit=2&cursor=${p1.nextCursor}`);
      expect(p2.items.map((n) => n.task.title)).toEqual(['M1', 'A2']);
      const p3 = await w.inbox(w.sara.api, 'all', `&limit=2&cursor=${p2.nextCursor}`);
      expect(p3.items.map((n) => n.task.title)).toEqual(['A1']);
      expect(p3.nextCursor).toBeNull();

      expect((await w.inbox(w.sara.api, 'mentions')).items.map((n) => n.task.id)).toEqual([
        m2.id,
        m1.id,
      ]);
      expect((await w.inbox(w.sara.api, 'assigned')).items.map((n) => n.task.id)).toEqual([
        a2.id,
        a1.id,
      ]);

      // Read one, archive one.
      const [first, second] = all.items;
      await w.call(w.sara.api, 'POST', `/me/notifications/${first?.id}/read`, undefined, 204);
      await w.call(w.sara.api, 'POST', `/me/notifications/${second?.id}/archive`, undefined, 204);
      const after = await w.inbox(w.sara.api);
      expect(after.counts).toEqual({ unread: 3, archived: 1 });
      expect(after.items.map((n) => n.id)).not.toContain(second?.id);
      expect(after.items.find((n) => n.id === first?.id)?.readAt).not.toBeNull();
      const archived = await w.inbox(w.sara.api, 'archived');
      expect(archived.items.map((n) => n.id)).toEqual([second?.id]);
      expect(archived.items[0]?.readAt).not.toBeNull();

      const sidebar = sidebarResponseSchema.parse(
        (await w.sara.api('GET', `/workspaces/${w.ws.id}/sidebar`)).json(),
      );
      expect(sidebar.inboxUnreadCount).toBe(3);

      const res = await w.call(w.sara.api, 'POST', '/me/notifications/read-all', {
        workspaceId: w.ws.id,
      });
      expect(readAllResultSchema.parse(res.json())).toEqual({ updated: 3 });
      expect((await w.inbox(w.sara.api)).counts).toEqual({ unread: 0, archived: 1 });
    });

    it('keeps the first read time', async () => {
      const w = await world();
      await w.createTask({ title: 'T', assigneeIds: [w.sara.user.id] });
      const [n] = await w.rows(w.sara.user.id);
      await w.call(w.sara.api, 'POST', `/me/notifications/${n?.id}/read`, undefined, 204);
      const [once] = await w.rows(w.sara.user.id);
      await w.call(w.sara.api, 'POST', `/me/notifications/${n?.id}/read`, undefined, 204);
      const [twice] = await w.rows(w.sara.user.id);
      expect(twice?.readAt).toEqual(once?.readAt);
    });

    it('hides notifications on deleted tasks', async () => {
      const w = await world();
      const task = await w.createTask({ title: 'T', assigneeIds: [w.sara.user.id] });
      expect((await w.inbox(w.sara.api)).items).toHaveLength(1);
      await w.call(w.api, 'DELETE', `/tasks/${task.id}`, undefined, 204);
      expect(await w.inbox(w.sara.api)).toMatchObject({
        items: [],
        counts: { unread: 0, archived: 0 },
      });
    });

    it("refuses other people's notifications, other workspaces and bad cursors", async () => {
      const w = await world();
      await w.createTask({ title: 'T', assigneeIds: [w.sara.user.id] });
      const [n] = await w.rows(w.sara.user.id);
      for (const action of ['read', 'archive']) {
        const res = await w.dorj.api('POST', `/me/notifications/${n?.id}/${action}`);
        expect(res.statusCode).toBe(404);
      }
      const other = await taskWorld(ctx, 'Outsider');
      const res = await other.api('GET', `/me/notifications?workspaceId=${w.ws.id}`);
      expect(res.statusCode).toBe(404);
      const readAll = await other.api('POST', '/me/notifications/read-all', {
        workspaceId: w.ws.id,
      });
      expect(readAll.statusCode).toBe(404);
      const bad = await w.sara.api('GET', `/me/notifications?workspaceId=${w.ws.id}&cursor=nope`);
      expect(bad.statusCode).toBe(400);
      expect(errorCode(bad)).toBe('INVALID_CURSOR');
    });
  });

  it('archives notifications read more than 30 days ago', async () => {
    const w = await world();
    for (const title of ['old', 'recent', 'unread']) {
      await w.createTask({ title, assigneeIds: [w.sara.user.id] });
    }
    const [old, recent, unread] = await w.rows(w.sara.user.id);
    if (!old || !recent || !unread) throw new Error('missing notifications');
    const now = new Date();
    const readDaysAgo = (id: string, days: number) =>
      ctx.db
        .update(notifications)
        .set({ readAt: new Date(now.getTime() - days * 86_400_000) })
        .where(eq(notifications.id, id));
    await readDaysAgo(old.id, 31);
    await readDaysAgo(recent.id, 29);

    expect(await archiveReadNotifications(ctx.db, now)).toBeGreaterThanOrEqual(1);
    const after = await w.rows(w.sara.user.id);
    expect(after.find((n) => n.id === old.id)?.archivedAt).toEqual(now);
    expect(after.find((n) => n.id === recent.id)?.archivedAt).toBeNull();
    expect(after.find((n) => n.id === unread.id)?.archivedAt).toBeNull();
  });
});
