import { notificationPageSchema, sidebarResponseSchema } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

const clock = testClock('2026-10-08T01:00:00Z'); // Thursday 09:00 in Ulaanbaatar

describe('standup notifications', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    clock.set('2026-10-08T01:00:00Z');
    const w = await standupWorld(ctx);
    const rows = (userId: string) =>
      ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(asc(notifications.createdAt), asc(notifications.id));
    const types = async (userId: string) => (await rows(userId)).map((n) => n.type);
    const inbox = async (api = w.api, query = '') =>
      notificationPageSchema.parse(
        (await api('GET', `/me/notifications?workspaceId=${w.ws.id}${query}`)).json(),
      );
    /** Moves the clock past the 5-minute collapse window. */
    const later = (minutes: number) => {
      clock.set(new Date(clock.now().getTime() + minutes * 60_000).toISOString());
    };
    return { ...w, rows, types, inbox, later };
  }

  it('tells helpers when they are named on a posted blocker, once', async () => {
    const w = await world();
    const draft = { text: 'Need sandbox keys', helperIds: [w.bat.user.id] };
    await w.save(w.dorj.api, { status: 'draft', blockers: [draft] });
    expect(await w.types(w.bat.user.id)).toEqual([]);

    const entry = await w.post(w.dorj.api, { blockers: [draft] });
    expect(await w.types(w.bat.user.id)).toEqual(['standup_help']);

    // Editing: only someone newly named hears about it.
    w.later(10);
    await w.post(w.dorj.api, {
      blockers: [
        { id: entry.blockers[0]?.id, ...draft, helperIds: [w.bat.user.id, w.sara.user.id] },
      ],
    });
    expect(await w.types(w.bat.user.id)).toEqual(['standup_help']);
    expect(await w.types(w.sara.user.id)).toEqual(['standup_help']);

    const page = await w.inbox(w.bat.api);
    expect(page.items[0]).toMatchObject({
      type: 'standup_help',
      task: null,
      project: null,
      actor: { id: w.dorj.user.id },
      snippet: 'Need sandbox keys',
      standup: {
        groupId: w.group.id,
        groupName: 'Mobile team',
        date: '2026-10-08',
        entryId: entry.id,
        blockerId: entry.blockers[0]?.id,
        entryAuthor: { id: w.dorj.user.id },
      },
    });
    const sidebar = sidebarResponseSchema.parse(
      (await w.bat.api('GET', `/workspaces/${w.ws.id}/sidebar`)).json(),
    );
    expect(sidebar.inboxUnreadCount).toBe(1);
  });

  it('tells the author about resolves and replies; a mention wins over the reply', async () => {
    const w = await world();
    const entry = await w.post(w.dorj.api, {
      blockers: [{ text: 'Keys', helperIds: [w.bat.user.id] }],
    });
    const blockerId = entry.blockers[0]?.id;

    // Resolving your own blocker notifies nobody; someone else resolving it tells you.
    await w.dorj.api('POST', `/standup-blockers/${blockerId}/resolve`);
    expect(await w.types(w.dorj.user.id)).toEqual([]);
    await w.dorj.api('DELETE', `/standup-blockers/${blockerId}/resolve`);
    await w.bat.api('POST', `/standup-blockers/${blockerId}/resolve`);
    expect(await w.types(w.dorj.user.id)).toEqual(['standup_resolved']);

    // A reply on the blocker tells the author; a mentioned group member gets a mention.
    await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: '@Anu can you check?',
      blockerId,
      mentionIds: [w.anu.user.id],
    });
    expect(await w.types(w.dorj.user.id)).toEqual(['standup_resolved', 'standup_reply']);
    expect(await w.types(w.anu.user.id)).toEqual(['mention']);

    // Mentioning the author: one notification, the mention.
    w.later(10);
    await w.bat.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: '@Dorj done',
      mentionIds: [w.dorj.user.id],
    });
    expect(await w.types(w.dorj.user.id)).toEqual(['standup_resolved', 'standup_reply', 'mention']);
    const mention = (await w.inbox(w.dorj.api, '&tab=mentions')).items[0];
    expect(mention).toMatchObject({ type: 'mention', snippet: '@Dorj done', task: null });

    // Reactions notify nobody.
    await w.sara.api('PUT', `/standup-entries/${entry.id}/reactions/heart`);
    expect(await w.types(w.dorj.user.id)).toHaveLength(3);
  });

  it('collapses replies on one update within 5 minutes', async () => {
    const w = await world();
    const entry = await w.post(w.dorj.api);
    await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'one' });
    w.later(2);
    await w.bat.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'two' });
    const rows = await w.rows(w.dorj.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(w.bat.user.id);
    expect((await w.inbox(w.dorj.api)).items[0]?.snippet).toBe('two');
  });

  it('follows the Standups switch, except for mentions', async () => {
    const w = await world();
    await w.dorj.api('PATCH', '/me', { notificationPrefs: { standups: false } });
    const entry = await w.post(w.dorj.api);
    await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'hi' });
    expect(await w.types(w.dorj.user.id)).toEqual([]);
    w.later(10);
    await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, {
      body: '@Dorj hi',
      mentionIds: [w.dorj.user.id],
    });
    expect(await w.types(w.dorj.user.id)).toEqual(['mention']);
  });

  it('leaves standup notifications out once the person leaves the group', async () => {
    const w = await world();
    const entry = await w.post(w.dorj.api);
    await w.sara.api('POST', `/standup-entries/${entry.id}/replies`, { body: 'hi' });
    expect((await w.inbox(w.dorj.api)).items).toHaveLength(1);
    await w.api('DELETE', `/standup-groups/${w.group.id}/members/${w.dorj.user.id}`);
    const page = await w.inbox(w.dorj.api);
    expect(page.items).toEqual([]);
    expect(page.counts.unread).toBe(0);
  });
});
