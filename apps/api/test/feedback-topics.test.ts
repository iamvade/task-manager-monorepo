import {
  feedbackListResponseSchema,
  feedbackTopicKey,
  feedbackTopicSchema,
  feedbackTopicWithCountSchema,
  publicFeedbackFormSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { feedback } from '../src/db/schema/index.js';
import { errorCode } from './fixtures.js';
import { detailOf, publicForm, validFeedback } from './feedback-setup.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('feedback topics', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const form = publicForm(ctx.app, w.ws.slug);
    const topics = async (api = w.api) => {
      const res = await api('GET', `/workspaces/${w.ws.id}/feedback-topics`);
      expect(res.statusCode, res.body).toBe(200);
      return z.array(feedbackTopicWithCountSchema).parse(res.json());
    };
    const createTopic = async (body: Record<string, unknown>, api = w.api) => {
      const res = await api('POST', `/workspaces/${w.ws.id}/feedback-topics`, body);
      expect(res.statusCode, res.body).toBe(201);
      return feedbackTopicSchema.parse(res.json());
    };
    const send = async (overrides: Parameters<typeof validFeedback>[0] = {}) => {
      const res = await form.submit(validFeedback(overrides));
      expect(res.statusCode, res.body).toBe(201);
      const number = Number(res.json<{ ref: string }>().ref.slice(3));
      const rows = await ctx.db.select().from(feedback).where(eq(feedback.workspaceId, w.ws.id));
      const mine = rows.find((r) => r.number === number);
      if (!mine) throw new Error('feedback not stored');
      return mine;
    };
    const list = async (query = '') => {
      const res = await w.api('GET', `/workspaces/${w.ws.id}/feedback${query}`);
      expect(res.statusCode, res.body).toBe(200);
      return feedbackListResponseSchema.parse(res.json());
    };
    return { ...w, form, topics, createTopic, send, list };
  }

  it('makes keys from names, Cyrillic included', () => {
    expect(feedbackTopicKey('Mobile app')).toBe('mobile-app');
    expect(feedbackTopicKey('Төлбөр')).toBe('tolbor');
    expect(feedbackTopicKey('None')).toBe('topic');
    expect(feedbackTopicKey('!!!')).toBe('topic');
  });

  it('admins create, rename, re-key and delete topics; members only read', async () => {
    const w = await world();
    const checkout = await w.createTopic({ name: 'Checkout', color: 'blue' });
    expect(checkout).toMatchObject({ key: 'checkout', name: 'Checkout', color: 'blue' });
    const app = await w.createTopic({ name: 'Mobile app', key: 'app' });
    expect(app.color).toBe('neutral');

    expect(
      errorCode(
        await w.api('POST', `/workspaces/${w.ws.id}/feedback-topics`, { name: 'checkout' }),
      ),
    ).toBe('TOPIC_EXISTS');
    expect(
      errorCode(
        await w.api('POST', `/workspaces/${w.ws.id}/feedback-topics`, { name: 'Apps', key: 'app' }),
      ),
    ).toBe('TOPIC_KEY_EXISTS');
    const reserved = await w.api('POST', `/workspaces/${w.ws.id}/feedback-topics`, {
      name: 'Nothing',
      key: 'none',
    });
    expect(reserved.statusCode).toBe(400);

    const renamed = await w.api('PATCH', `/feedback-topics/${checkout.id}`, { name: 'Payments' });
    expect(renamed.statusCode, renamed.body).toBe(200);
    // The key stays, so links shared earlier keep working.
    expect(renamed.json()).toMatchObject({ name: 'Payments', key: 'checkout' });
    expect(errorCode(await w.api('PATCH', `/feedback-topics/${checkout.id}`, { key: 'app' }))).toBe(
      'TOPIC_KEY_EXISTS',
    );

    const member = await w.person('member');
    expect((await w.topics(member.api)).map((t) => t.name)).toEqual(['Mobile app', 'Payments']);
    for (const res of [
      await member.api('POST', `/workspaces/${w.ws.id}/feedback-topics`, { name: 'X' }),
      await member.api('PATCH', `/feedback-topics/${app.id}`, { name: 'Y' }),
      await member.api('DELETE', `/feedback-topics/${app.id}`),
    ]) {
      expect(res.statusCode).toBe(403);
    }
    const outsider = await w.person(null);
    for (const res of [
      await outsider.api('GET', `/workspaces/${w.ws.id}/feedback-topics`),
      await outsider.api('PATCH', `/feedback-topics/${app.id}`, { name: 'Y' }),
      await outsider.api('DELETE', `/feedback-topics/${app.id}`),
    ]) {
      expect(res.statusCode).toBe(404);
    }

    expect((await w.api('DELETE', `/feedback-topics/${app.id}`)).statusCode).toBe(204);
    expect((await w.topics()).map((t) => t.key)).toEqual(['checkout']);
  });

  it('the public form lists topics and files a report under the linked key', async () => {
    const w = await world();
    const checkout = await w.createTopic({ name: 'Checkout' });
    await w.createTopic({ name: 'Account' });

    const page = publicFeedbackFormSchema.parse((await w.form.call('GET', `/${w.ws.slug}`)).json());
    expect(page.topics).toEqual([
      { key: 'account', name: 'Account' },
      { key: 'checkout', name: 'Checkout' },
    ]);

    const filed = await w.send({ topic: 'Checkout' });
    expect(filed.topicId).toBe(checkout.id);
    // A key the workspace doesn't have still files the report, without a topic.
    expect((await w.send({ title: 'Another one', topic: 'gone' })).topicId).toBeNull();
    expect((await w.send({ title: 'No topic here' })).topicId).toBeNull();

    expect((await w.topics()).find((t) => t.id === checkout.id)?.feedbackCount).toBe(1);
  });

  it('filters the inbox by topic, changes an item’s topic and logs it', async () => {
    const w = await world();
    const checkout = await w.createTopic({ name: 'Checkout' });
    const account = await w.createTopic({ name: 'Account' });
    const a = await w.send({ title: 'Pay button freezes', topic: 'checkout', type: 'bug' });
    await w.send({ title: 'Cannot log in', topic: 'account', type: 'bug' });
    await w.send({ title: 'Love the app', type: 'feedback' });

    const byCheckout = await w.list('?topic=checkout');
    expect(byCheckout.items.map((i) => i.title)).toEqual(['Pay button freezes']);
    expect(byCheckout.items[0]?.topic).toMatchObject({ id: checkout.id, name: 'Checkout' });
    expect(byCheckout.typeCounts).toMatchObject({ all: 1, bug: 1, feedback: 0 });
    expect((await w.list('?topic=none')).items.map((i) => i.title)).toEqual(['Love the app']);
    expect((await w.list('?topic=unknown')).total).toBe(0);
    expect((await w.list()).total).toBe(3);

    const member = await w.person('member');
    const moved = detailOf(await member.api('PATCH', `/feedback/${a.id}`, { topicId: account.id }));
    expect(moved.topic?.id).toBe(account.id);
    expect(moved.isRead).toBe(false);
    expect(moved.activity.at(-1)).toMatchObject({
      kind: 'topic_change',
      data: {
        fromTopic: { id: checkout.id, name: 'Checkout' },
        toTopic: { id: account.id, name: 'Account' },
      },
    });
    // Same topic again writes nothing.
    const again = detailOf(await w.api('PATCH', `/feedback/${a.id}`, { topicId: account.id }));
    expect(again.activity).toHaveLength(moved.activity.length);

    const cleared = detailOf(await w.api('PATCH', `/feedback/${a.id}`, { topicId: null }));
    expect(cleared.topic).toBeNull();
    expect(cleared.activity.at(-1)?.data).toMatchObject({ toTopic: null });

    // Another workspace's topic is refused.
    const other = await world();
    const foreign = await other.createTopic({ name: 'Foreign' });
    expect(errorCode(await w.api('PATCH', `/feedback/${a.id}`, { topicId: foreign.id }))).toBe(
      'INVALID_REFERENCE',
    );
    expect((await w.api('PATCH', `/feedback/${a.id}`, {})).statusCode).toBe(400);
  });

  it('deleting a topic leaves its feedback without one', async () => {
    const w = await world();
    const topic = await w.createTopic({ name: 'Checkout' });
    const fb = await w.send({ topic: 'checkout' });
    expect((await w.api('DELETE', `/feedback-topics/${topic.id}`)).statusCode).toBe(204);
    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, fb.id));
    expect(row?.topicId).toBeNull();
    expect((await w.list('?topic=none')).total).toBe(1);
  });
});
