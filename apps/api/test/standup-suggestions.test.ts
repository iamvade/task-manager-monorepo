import type { StatusCategory } from '@kite/shared';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activity, workspaceHolidays } from '../src/db/schema/index.js';
import { createTestApp } from './helpers.js';
import { standupWorld, testClock } from './standup-setup.js';

const clock = testClock('2026-10-12T00:30:00Z'); // Monday Oct 12, 08:30 in Ulaanbaatar

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('standup suggestions', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: clock.now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await standupWorld(ctx);
    /** The latest `type` activity row of the task moves to `iso` (as if it happened then). */
    const backdate = async (
      taskId: string,
      type: 'status.changed' | 'comment.added',
      iso: string,
    ) => {
      const [row] = await ctx.db
        .select({ id: activity.id })
        .from(activity)
        .where(and(eq(activity.taskId, taskId), eq(activity.type, type)))
        .orderBy(desc(activity.createdAt))
        .limit(1);
      if (!row) throw new Error(`no ${type} on ${taskId}`);
      await ctx.db
        .update(activity)
        .set({ createdAt: new Date(iso) })
        .where(eq(activity.id, row.id));
    };
    /** `api` moves the task into `category` at `iso`. */
    const move = async (taskId: string, category: StatusCategory, iso: string, api = w.api) => {
      const res = await api('PATCH', `/tasks/${taskId}`, { statusId: w.status(category).id });
      expect(res.statusCode, res.body).toBe(200);
      await ctx.app.events.idle();
      await backdate(taskId, 'status.changed', iso);
    };
    const comment = async (taskId: string, iso: string, api = w.api) => {
      const res = await api('POST', `/tasks/${taskId}/comments`, { body: doc('note') });
      expect(res.statusCode, res.body).toBe(201);
      await ctx.app.events.idle();
      await backdate(taskId, 'comment.added', iso);
    };
    return { ...w, move, comment };
  }

  it('covers the activity since Friday’s post-by time on Monday, strongest kind once', async () => {
    const w = await world();
    const t = async (title: string) => w.createTask({ title });
    const [thu, friEarly, review, weekend, commented, others, reopened, deleted] =
      await Promise.all(
        ['Thu', 'FriEarly', 'Review', 'Weekend', 'Commented', 'Others', 'Reopened', 'Deleted'].map(
          t,
        ),
      );
    if (!thu || !friEarly || !review || !weekend || !commented || !others || !reopened || !deleted)
      throw new Error('tasks');

    await w.move(thu.id, 'done', '2026-10-08T07:00:00Z'); // Thursday: before the window
    await w.comment(friEarly.id, '2026-10-09T01:00:00Z'); // Fri 09:00, before post-by
    await w.move(review.id, 'review', '2026-10-09T03:00:00Z'); // Fri 11:00
    await w.comment(review.id, '2026-10-09T04:00:00Z');
    await w.move(weekend.id, 'done', '2026-10-10T06:00:00Z'); // Saturday
    await w.comment(weekend.id, '2026-10-12T00:00:00Z'); // Monday 08:00: completed still wins
    await w.comment(commented.id, '2026-10-11T03:00:00Z'); // Sunday
    await w.move(others.id, 'done', '2026-10-10T03:00:00Z', w.sara.api); // someone else
    await w.move(reopened.id, 'review', '2026-10-09T05:00:00Z');
    await w.move(reopened.id, 'in_progress', '2026-10-09T06:00:00Z'); // no longer in review
    await w.move(deleted.id, 'done', '2026-10-09T05:00:00Z');
    await w.api('DELETE', `/tasks/${deleted.id}`);

    const s = await w.suggestions();
    expect(s).toMatchObject({
      date: '2026-10-12',
      previousDate: '2026-10-09',
      since: '2026-10-09T02:00:00.000Z',
      until: '2026-10-12T00:30:00.000Z',
    });
    expect(s.yesterday.map((y) => [y.task.title, y.kind])).toEqual([
      ['Commented', 'commented'],
      ['Weekend', 'completed'],
      ['Review', 'review'],
    ]);
    expect(s.yesterday[1]?.task).toMatchObject({ key: weekend.key, statusCategory: 'done' });
  });

  it('skips a holiday when finding the previous standup day', async () => {
    const w = await world();
    // Tue Nov 10 2026 (Chinggis Khaan's birthday) is a holiday: Wednesday's previous day is Monday.
    await ctx.db
      .insert(workspaceHolidays)
      .values({ workspaceId: w.ws.id, date: '2026-11-10', name: 'Holiday' });
    clock.set('2026-11-11T01:00:00Z'); // Wed Nov 11, 09:00
    const mon = await w.createTask({ title: 'Monday morning' });
    const tue = await w.createTask({ title: 'Holiday work' });
    await w.move(mon.id, 'done', '2026-11-09T01:00:00Z'); // Mon 09:00: before post-by
    await w.move(tue.id, 'done', '2026-11-10T05:00:00Z');
    const s = await w.suggestions();
    expect(s).toMatchObject({ previousDate: '2026-11-09', since: '2026-11-09T02:00:00.000Z' });
    expect(s.yesterday.map((y) => y.task.title)).toEqual(['Holiday work']);
    clock.set('2026-10-12T00:30:00Z');
  });

  it('suggests today’s open tasks: overdue, due today, then in progress', async () => {
    const w = await world();
    const me = [w.owner.id];
    await w.createTask({ title: 'Later', assigneeIds: me, dueDate: '2026-10-20' });
    await w.createTask({
      title: 'Doing',
      assigneeIds: me,
      statusId: w.status('in_progress').id,
    });
    await w.createTask({ title: 'Today', assigneeIds: me, dueDate: '2026-10-12' });
    await w.createTask({ title: 'Late', assigneeIds: me, dueDate: '2026-10-09' });
    await w.createTask({
      title: 'Late and doing',
      assigneeIds: me,
      dueDate: '2026-10-05',
      statusId: w.status('in_progress').id,
    });
    await w.createTask({
      title: 'Done',
      assigneeIds: me,
      dueDate: '2026-10-12',
      statusId: w.status('done').id,
    });
    await w.createTask({ title: 'Not mine', dueDate: '2026-10-12' });
    const s = await w.suggestions();
    expect(s.today.map((t) => [t.task.title, t.tag])).toEqual([
      ['Late and doing', 'overdue'],
      ['Late', 'overdue'],
      ['Today', 'due_today'],
      ['Doing', 'in_progress'],
    ]);
  });
});
