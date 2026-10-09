import {
  commentSchema,
  feedItemSchema,
  subtaskSchema,
  taskDetailSchema,
  taskFollowersSchema,
  type FeedItem,
  type RichTextNode,
} from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DomainEvent } from '../src/events/bus.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

const doc = (text: string, mentionId?: string): RichTextNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text },
        ...(mentionId ? [{ type: 'mention', attrs: { id: mentionId, label: 'X' } }] : []),
      ],
    },
  ],
});

/** A compact line per feed item, for order assertions. */
const line = (item: FeedItem) =>
  item.kind === 'comment' ? `comment:${item.bodyText}:${item.replies.length}` : item.type;

describe('activity feed', () => {
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

  it('merges history and comment threads oldest first, per tab', async () => {
    const { api, owner, status, createTask, person } = await taskWorld(ctx);
    const sara = await person('member', 'Sara Khan');
    const task = await createTask({ title: 'Checkout page' });
    const feed = async (type?: string) => {
      const res = await api('GET', `/tasks/${task.id}/activity${type ? `?type=${type}` : ''}`);
      expect(res.statusCode, res.body).toBe(200);
      return z.array(feedItemSchema).parse(res.json());
    };

    await api('PATCH', `/tasks/${task.id}`, { priority: 'high' });
    const c1 = commentSchema.parse(
      (await sara.api('POST', `/tasks/${task.id}/comments`, { body: doc('Heads up') })).json(),
    );
    await api('POST', `/tasks/${task.id}/comments`, { body: doc('Ok'), parentId: c1.id });
    await api('PATCH', `/tasks/${task.id}`, { statusId: status('in_progress').id });
    const sub = subtaskSchema.parse(
      (await api('POST', `/tasks/${task.id}/subtasks`, { title: 'QA' })).json(),
    );
    await api('PATCH', `/subtasks/${sub.id}`, { done: true });
    await sara.api('POST', `/tasks/${task.id}/comments`, { body: doc('Done?') });

    const all = await feed();
    expect(all.map(line)).toEqual([
      'task.created',
      'priority.changed',
      'comment:Heads up:1',
      'status.changed',
      'subtask.added',
      'subtask.completed',
      'comment:Done?:0',
    ]);
    expect(await feed('all')).toEqual(all);
    expect((await feed('comments')).map(line)).toEqual(['comment:Heads up:1', 'comment:Done?:0']);
    expect((await feed('history')).map(line)).toEqual([
      'task.created',
      'priority.changed',
      'status.changed',
      'subtask.added',
      'subtask.completed',
    ]);

    const [created, priority, , changed] = all;
    expect(created).toMatchObject({ kind: 'history', actor: { id: owner.id, name: 'Anu Bold' } });
    expect(priority).toMatchObject({ payload: { from: 'none', to: 'high' } });
    expect(changed).toMatchObject({
      payload: { from: { category: 'todo' }, to: { category: 'in_progress' } },
    });
    expect(all[2]).toMatchObject({ kind: 'comment', author: { id: sara.user.id } });

    expect((await api('GET', `/tasks/${task.id}/activity?type=nope`)).statusCode).toBe(400);
    const { api: outsider } = await person(null);
    expect((await outsider('GET', `/tasks/${task.id}/activity`)).statusCode).toBe(404);
  });

  it('follows and unfollows idempotently', async () => {
    const { api, owner, createTask, person } = await taskWorld(ctx);
    const sara = await person('member', 'Sara Khan');
    const task = await createTask({ title: 'T' });
    const call = async (method: 'POST' | 'DELETE', who = sara.api) => {
      const res = await who(method, `/tasks/${task.id}/follow`);
      expect(res.statusCode, res.body).toBe(200);
      return taskFollowersSchema.parse(res.json());
    };

    expect(await call('POST')).toMatchObject({ following: true });
    const twice = await call('POST');
    expect(twice.followers.map((f) => f.id).sort()).toEqual([owner.id, sara.user.id].sort());
    expect(await call('DELETE')).toEqual({
      following: false,
      followers: [expect.objectContaining({ id: owner.id })],
    });
    expect((await call('DELETE')).following).toBe(false);

    const { api: outsider } = await person(null);
    expect((await outsider('POST', `/tasks/${task.id}/follow`)).statusCode).toBe(404);
    await api('DELETE', `/tasks/${task.id}`);
    expect((await sara.api('POST', `/tasks/${task.id}/follow`)).statusCode).toBe(404);
  });

  it('auto-follows creator, assignees, commenters and mentioned members', async () => {
    const { api, owner, createTask, person } = await taskWorld(ctx);
    const [assignee, commenter, mentioned, described, later] = await Promise.all(
      ['Ann', 'Com', 'Men', 'Desc', 'Late'].map((name) => person('member', `${name} User`)),
    );
    if (!assignee || !commenter || !mentioned || !described || !later) throw new Error('setup');
    const task = await createTask({
      title: 'T',
      assigneeIds: [assignee.user.id],
      description: doc('Spec by ', described.user.id),
    });
    await commenter.api('POST', `/tasks/${task.id}/comments`, {
      body: doc('cc ', mentioned.user.id),
    });

    const before = seen.length;
    const res = await api('PATCH', `/tasks/${task.id}`, {
      description: doc('Spec by ', later.user.id),
    });
    expect(res.statusCode, res.body).toBe(200);
    const updated = seen.slice(before).find((e) => e.type === 'task.updated');
    expect(updated?.mentionedUserIds).toEqual([later.user.id]);

    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.followers.map((f) => f.id).sort()).toEqual(
      [owner, ...[assignee, commenter, mentioned, described, later].map((p) => p.user)]
        .map((u) => u.id)
        .sort(),
    );
  });
});
