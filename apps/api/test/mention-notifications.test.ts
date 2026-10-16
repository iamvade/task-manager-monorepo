import { commentSchema, type RichTextNode } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications } from '../src/db/schema/index.js';
import { pickCandidate, type Candidate } from '../src/notifications/fanout.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Part = string | { id: string };
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

const ALL_ON = { mention: true, assigned: true, comment: true, status: true, standups: true };

describe('pickCandidate', () => {
  const c = (type: Candidate['type']): Candidate => ({ type, activityId: null });

  it('picks the highest enabled type: mention > assigned > comment > status', () => {
    const all = [c('status'), c('comment'), c('assigned'), c('mention')];
    expect(pickCandidate(all, ALL_ON)?.type).toBe('mention');
    expect(pickCandidate(all, { ...ALL_ON, mention: false })?.type).toBe('assigned');
    expect(pickCandidate(all, { ...ALL_ON, mention: false, assigned: false })?.type).toBe(
      'comment',
    );
    expect(
      pickCandidate(all, { ...ALL_ON, mention: false, assigned: false, comment: false })?.type,
    ).toBe('status');
    expect(
      pickCandidate(all, {
        ...ALL_ON,
        mention: false,
        assigned: false,
        comment: false,
        status: false,
      }),
    ).toBeUndefined();
    expect(pickCandidate([], ALL_ON)).toBeUndefined();
  });
});

describe('mention notifications', () => {
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
    const task = await w.createTask({ title: 'Checkout page' });
    const comment = async (client: typeof w.api, body: RichTextNode) => {
      const res = await client('POST', `/tasks/${task.id}/comments`, { body });
      expect(res.statusCode, res.body).toBe(201);
      await ctx.app.events.idle();
      return commentSchema.parse(res.json());
    };
    const rows = (userId: string) =>
      ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(asc(notifications.createdAt), asc(notifications.id));
    const backdate = async (id: string, ms: number) => {
      await ctx.db
        .update(notifications)
        .set({ createdAt: new Date(Date.now() - ms) })
        .where(eq(notifications.id, id));
    };
    return { ...w, sara, dorj, task, comment, rows, backdate };
  }

  it('collapses a second mention on the same task within 5 minutes, keeping the latest actor', async () => {
    const w = await world();
    await w.comment(w.api, doc('look ', { id: w.dorj.user.id }));
    const [first] = await w.rows(w.dorj.user.id);
    if (!first) throw new Error('no notification');
    await w.backdate(first.id, 4 * 60_000 + 50_000);

    await w.comment(w.sara.api, doc('me too ', { id: w.dorj.user.id }));
    const rows = await w.rows(w.dorj.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.id, type: 'mention', actorId: w.sara.user.id });
    expect(rows[0]?.activityId).not.toBe(first.activityId);
    expect(rows[0]?.createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime());
  });

  it('starts a new one just past the window', async () => {
    const w = await world();
    await w.comment(w.api, doc('look ', { id: w.dorj.user.id }));
    const [first] = await w.rows(w.dorj.user.id);
    if (!first) throw new Error('no notification');
    await w.backdate(first.id, 5 * 60_000 + 10_000);

    await w.comment(w.sara.api, doc('again ', { id: w.dorj.user.id }));
    expect((await w.rows(w.dorj.user.id)).map((n) => n.type)).toEqual(['mention', 'mention']);
  });

  it('never folds into an archived (even unread) notification', async () => {
    const w = await world();
    await w.comment(w.api, doc('look ', { id: w.dorj.user.id }));
    const [first] = await w.rows(w.dorj.user.id);
    const archived = await w.dorj.api('POST', `/me/notifications/${first?.id}/archive`);
    expect(archived.statusCode).toBe(204);

    await w.comment(w.sara.api, doc('again ', { id: w.dorj.user.id }));
    const rows = await w.rows(w.dorj.user.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ archivedAt: null, readAt: null, actorId: w.sara.user.id });
  });

  it('does not notify a self-mention', async () => {
    const w = await world();
    await w.comment(w.sara.api, doc('note to self ', { id: w.sara.user.id }));
    expect(await w.rows(w.sara.user.id)).toEqual([]);
  });

  it('does not notify again when a comment is edited without new mentions', async () => {
    const w = await world();
    const c = await w.comment(w.sara.api, doc('hey ', { id: w.dorj.user.id }));
    const [first] = await w.rows(w.dorj.user.id);
    await w.dorj.api('POST', `/me/notifications/${first?.id}/read`);

    const res = await w.sara.api('PATCH', `/comments/${c.id}`, {
      body: doc('hey (edited) ', { id: w.dorj.user.id }),
    });
    expect(res.statusCode, res.body).toBe(200);
    await ctx.app.events.idle();
    expect(await w.rows(w.dorj.user.id)).toHaveLength(1);
  });

  it('honours assigned and status preferences being off', async () => {
    const w = await world();
    const off = await w.dorj.api('PATCH', '/me', {
      notificationPrefs: { assigned: false, status: false },
    });
    expect(off.statusCode, off.body).toBe(200);

    const assign = await w.api('PUT', `/tasks/${w.task.id}/assignees`, {
      userIds: [w.dorj.user.id],
    });
    expect(assign.statusCode, assign.body).toBe(200);
    await ctx.app.events.idle();
    // Assignees follow the task; a status change is still silent with `status` off.
    const status = await w.api('PATCH', `/tasks/${w.task.id}`, {
      statusId: w.status('in_progress').id,
    });
    expect(status.statusCode, status.body).toBe(200);
    await ctx.app.events.idle();
    expect(await w.rows(w.dorj.user.id)).toEqual([]);

    // Mentions still come through.
    await w.comment(w.sara.api, doc('ping ', { id: w.dorj.user.id }));
    expect((await w.rows(w.dorj.user.id)).map((n) => n.type)).toEqual(['mention']);
  });

  it('produces exactly one row for a burst of concurrent mentions', async () => {
    const w = await world();
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? w.api : w.sara.api)('POST', `/tasks/${w.task.id}/comments`, {
          body: doc(`burst ${i} `, { id: w.dorj.user.id }),
        }),
      ),
    );
    for (const res of responses) expect(res.statusCode, res.body).toBe(201);
    await ctx.app.events.idle();
    const rows = await w.rows(w.dorj.user.id);
    expect(rows.map((n) => n.type)).toEqual(['mention']);
  });
});
