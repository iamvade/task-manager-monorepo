import {
  feedbackCreateTaskResultSchema,
  feedbackListResponseSchema,
  feedbackOptionsSchema,
  feedbackTaskSuggestionsSchema,
  sidebarResponseSchema,
  taskDetailSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachments, feedback } from '../src/db/schema/index.js';
import { storedBytes } from '../src/attachments/quota.js';
import { errorCode } from './fixtures.js';
import { PDF, detailOf, publicForm, validFeedback } from './feedback-setup.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('feedback inbox', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kite-feedback-inbox-'));
    ctx = await createTestApp({ UPLOADS_DIR: dir });
  });
  afterAll(async () => {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function world() {
    const w = await taskWorld(ctx);
    const form = publicForm(ctx.app, w.ws.slug);
    const send = async (overrides: Parameters<typeof validFeedback>[0] = {}) => {
      const res = await form.submit(validFeedback(overrides));
      expect(res.statusCode, res.body).toBe(201);
      const number = Number(res.json<{ ref: string }>().ref.slice(3));
      const rows = await ctx.db.select().from(feedback).where(eq(feedback.workspaceId, w.ws.id));
      const mine = rows.find((r) => r.number === number);
      if (!mine) throw new Error('feedback not stored');
      return mine;
    };
    const list = async (query = '', api = w.api) => {
      const res = await api('GET', `/workspaces/${w.ws.id}/feedback${query}`);
      expect(res.statusCode, res.body).toBe(200);
      return feedbackListResponseSchema.parse(res.json());
    };
    const detail = async (ref: string, api = w.api) =>
      detailOf(await api('GET', `/workspaces/${w.ws.id}/feedback/${ref}`));
    return { ...w, form, send, list, detail };
  }

  it('lists newest first with counts, search, type and status filters, and pages', async () => {
    const w = await world();
    await w.send({ type: 'bug', title: 'Pay button freezes', email: 'a@example.com' });
    await w.send({ type: 'feature', title: 'Add QPay please', name: 'Batbayar' });
    const third = await w.send({ type: 'bug', title: 'Promo code cut off' });
    await w.api('PATCH', `/feedback/${third.id}`, { status: 'review' });

    const all = await w.list();
    expect(all.items.map((i) => i.ref)).toEqual(['FB-1003', 'FB-1002', 'FB-1001']);
    expect(all).toMatchObject({
      total: 3,
      unread: 2,
      typeCounts: { all: 3, bug: 2, feature: 1, feedback: 0, other: 0 },
      statusCounts: { new: 2, review: 1, linked: 0, closed: 0 },
    });
    expect(all.items[0]?.preview).toContain('When I tap Pay');

    const bugs = await w.list('?type=bug');
    expect(bugs.total).toBe(2);
    expect(bugs.statusCounts).toEqual({ new: 1, review: 1, linked: 0, closed: 0 });
    expect(bugs.typeCounts.feature).toBe(1);
    expect((await w.list('?type=bug&status=new&status=review')).total).toBe(2);
    expect((await w.list('?status=review')).items.map((i) => i.ref)).toEqual(['FB-1003']);
    expect((await w.list('?q=qpay')).items.map((i) => i.ref)).toEqual(['FB-1002']);
    expect((await w.list('?q=batbayar')).total).toBe(1);
    expect((await w.list('?q=a%40example.com')).total).toBe(1);
    expect((await w.list('?q=fb-1001')).items.map((i) => i.ref)).toEqual(['FB-1001']);
    const page = await w.list('?limit=2&offset=2');
    expect(page.items.map((i) => i.ref)).toEqual(['FB-1001']);
    expect(page.total).toBe(3);
  });

  it('marks read on open and counts unread new items in the sidebar', async () => {
    const w = await world();
    const a = await w.send();
    await w.send({ title: 'Second one here' });
    const sidebar = async () =>
      sidebarResponseSchema.parse((await w.api('GET', `/workspaces/${w.ws.id}/sidebar`)).json())
        .feedbackUnreadCount;
    expect(await sidebar()).toBe(2);
    const member = await w.person('member');
    expect((await member.api('POST', `/feedback/${a.id}/read`)).statusCode).toBe(204);
    expect(await sidebar()).toBe(1);
    expect((await w.detail('FB-1001')).isRead).toBe(true);
  });

  it('logs status changes and notes; outsiders get 404', async () => {
    const w = await world();
    const fb = await w.send();
    detailOf(await w.api('PATCH', `/feedback/${fb.id}`, { status: 'review' }));
    const withNote = detailOf(
      await w.api('POST', `/feedback/${fb.id}/notes`, { text: 'Seen on iOS' }),
    );
    expect(withNote.activity.map((a) => [a.kind, a.actor?.id ?? null])).toEqual([
      ['created', null],
      ['status_change', w.owner.id],
      ['note', w.owner.id],
    ]);
    expect(withNote.activity[1]?.data).toEqual({ from: 'new', to: 'review' });
    expect(withNote.activity[2]?.text).toBe('Seen on iOS');

    const outsider = await w.person(null);
    for (const res of [
      await outsider.api('GET', `/workspaces/${w.ws.id}/feedback`),
      await outsider.api('PATCH', `/feedback/${fb.id}`, { status: 'closed' }),
      await outsider.api('POST', `/feedback/${fb.id}/notes`, { text: 'x' }),
    ]) {
      expect(res.statusCode).toBe(404);
    }
  });

  it('links to a task (status Linked), relinks, unlinks back to In review', async () => {
    const w = await world();
    const fb = await w.send();
    const a = await w.createTask({ title: 'Fix payment freeze' });
    const b = await w.createTask({ title: 'Other task' });
    const linked = detailOf(await w.api('PUT', `/feedback/${fb.id}/link`, { taskId: a.id }));
    expect(linked).toMatchObject({ status: 'linked', task: { id: a.id, key: a.key } });
    expect(linked.linkedReports.map((r) => r.id)).toEqual([fb.id]);

    const moved = detailOf(await w.api('PUT', `/feedback/${fb.id}/link`, { taskId: b.id }));
    expect(moved.task?.id).toBe(b.id);
    const unlinked = detailOf(await w.api('DELETE', `/feedback/${fb.id}/link`));
    expect(unlinked).toMatchObject({ status: 'review', task: null });
    expect(unlinked.activity.map((x) => x.kind)).toEqual([
      'created',
      'linked',
      'unlinked',
      'linked',
      'unlinked',
    ]);
    // Linking writes nothing on the task.
    expect((await w.activities(a.id)).map((x) => x.type)).toEqual(['task.created']);

    const outsiderTask = await (await taskWorld(ctx, 'Other Owner')).createTask({ title: 'Nope' });
    const res = await w.api('PUT', `/feedback/${fb.id}/link`, { taskId: outsiderTask.id });
    expect(res.statusCode).toBe(404);
  });

  it('groups duplicates on one task and shows them on the task', async () => {
    const w = await world();
    const task = await w.createTask({ title: 'Checkout overlaps' });
    const first = await w.send({ title: 'First report' });
    const second = await w.send({ title: 'Second report', name: '' });
    const res = await w.api('POST', `/workspaces/${w.ws.id}/feedback/batch`, {
      ids: [first.id, second.id],
      change: { action: 'link', taskId: task.id },
    });
    expect(res.json()).toEqual({ changed: 2 });
    const d = await w.detail('FB-1002');
    expect(d.linkedReports.map((r) => r.ref)).toEqual(['FB-1001', 'FB-1002']);

    const taskDetail = taskDetailSchema.parse((await w.api('GET', `/tasks/${task.id}`)).json());
    expect(taskDetail.linkedFeedback.map((f) => f.ref)).toEqual(['FB-1002', 'FB-1001']);

    const closed = await w.api('POST', `/workspaces/${w.ws.id}/feedback/batch`, {
      ids: [first.id, second.id],
      change: { action: 'status', status: 'closed' },
    });
    expect(closed.json()).toEqual({ changed: 2 });
    expect((await w.detail('FB-1001')).task?.id).toBe(task.id);

    const foreign = await (await world()).send();
    const bad = await w.api('POST', `/workspaces/${w.ws.id}/feedback/batch`, {
      ids: [first.id, foreign.id],
      change: { action: 'unlink' },
    });
    expect(bad.statusCode).toBe(404);
    expect((await w.detail('FB-1001')).task?.id).toBe(task.id);
  });

  it('links from the task side and lists only unlinked open feedback there', async () => {
    const w = await world();
    const task = await w.createTask({ title: 'Search blank screen' });
    const open = await w.send({ title: 'Search shows a blank screen' });
    const closed = await w.send({ title: 'Closed one' });
    await w.api('PATCH', `/feedback/${closed.id}`, { status: 'closed' });
    const options = async (q = '') =>
      feedbackOptionsSchema
        .parse((await w.api('GET', `/tasks/${task.id}/feedback-options${q}`)).json())
        .items.map((i) => i.ref);
    expect(await options()).toEqual(['FB-1001']);
    expect(await options('?q=blank')).toEqual(['FB-1001']);
    expect(await options('?q=fb-1001')).toEqual(['FB-1001']);
    expect(await options('?q=zzz')).toEqual([]);
    expect((await w.api('PUT', `/tasks/${task.id}/feedback/${open.id}`)).statusCode).toBe(204);
    expect(await options()).toEqual([]);
    expect((await w.detail('FB-1001')).status).toBe('linked');
  });

  it('suggests similar open tasks', async () => {
    const w = await world();
    const fb = await w.send({ title: 'Pay button freezes at checkout' });
    const similar = await w.createTask({ title: 'Pay button freezes on checkout' });
    await w.createTask({ title: 'Write release notes' });
    const res = await w.api('GET', `/feedback/${fb.id}/task-suggestions`);
    const { tasks } = feedbackTaskSuggestionsSchema.parse(res.json());
    expect(tasks.map((t) => t.id)).toEqual([similar.id]);
  });

  it("sets the linked task's assignees through the feedback", async () => {
    const w = await world();
    const fb = await w.send();
    const notLinked = await w.api('PUT', `/feedback/${fb.id}/assignees`, { userIds: [] });
    expect(errorCode(notLinked)).toBe('NOT_LINKED');
    const task = await w.createTask({ title: 'Fix it' });
    await w.api('PUT', `/feedback/${fb.id}/link`, { taskId: task.id });
    const dorj = await w.person('member', 'Dorj E.');
    const d = detailOf(
      await w.api('PUT', `/feedback/${fb.id}/assignees`, { userIds: [dorj.user.id] }),
    );
    expect(d.task?.assignees.map((u) => u.id)).toEqual([dorj.user.id]);
    expect(d.activity.at(-1)).toMatchObject({
      kind: 'assignee_change',
      data: { assignees: [{ id: dorj.user.id, name: 'Dorj E.' }], task: { id: task.id } },
    });
    expect((await w.activities(task.id)).map((a) => a.type)).toContain('assignee.added');
  });

  it('creates a task from feedback with copied files and no contact details', async () => {
    const w = await world();
    const pdf = await w.form.upload('log.pdf', PDF, 'application/pdf');
    const png = await w.form.upload();
    const fb = await w.send({
      uploads: [pdf, png].map(({ id, token }) => ({ id, token })),
    });
    const res = await w.api('POST', `/feedback/${fb.id}/create-task`, {
      projectId: w.project.id,
      title: 'App freezes on payment',
      description:
        'When I tap Pay it freezes.\n\nDevice: iPhone · iOS 17.4\n— From feedback: Enkhjin D. · FB-1001',
      assigneeIds: [w.owner.id],
      priority: 'high',
      dueDate: '2026-10-21',
      attachmentIds: [pdf.id],
      notifyOnDone: true,
    });
    expect(res.statusCode, res.body).toBe(201);
    const result = feedbackCreateTaskResultSchema.parse(res.json());
    expect(result.feedback).toMatchObject({ status: 'linked', notifyOnDone: true });
    expect(result.task.key).toBe(`${w.project.key}-1`);

    const task = taskDetailSchema.parse((await w.api('GET', `/tasks/${result.task.id}`)).json());
    expect(task).toMatchObject({
      priority: 'high',
      dueDate: '2026-10-21',
      title: 'App freezes on payment',
    });
    expect(task.attachments.map((a) => a.filename)).toEqual(['log.pdf']);
    expect(JSON.stringify(task.description)).not.toContain('enkhjin@example.com');
    expect(task.descriptionText).not.toContain('9911');
    const [copy] = await ctx.db.select().from(attachments).where(eq(attachments.taskId, task.id));
    const download = await w.api('GET', `/attachments/${copy?.id}/download`);
    expect(download.body).toBe(new TextDecoder().decode(PDF));
    // The feedback still has its own copy.
    const original = await w.api('GET', `/feedback/${fb.id}/attachments/${pdf.id}/download`);
    expect(original.statusCode).toBe(200);

    const keep = await w.send({ title: 'Keep status' });
    const kept = await w.api('POST', `/feedback/${keep.id}/create-task`, {
      projectId: w.project.id,
      title: 'Another',
      setLinked: false,
    });
    expect(feedbackCreateTaskResultSchema.parse(kept.json()).feedback).toMatchObject({
      status: 'new',
      task: { title: 'Another' },
    });

    const wrongFile = await w.api('POST', `/feedback/${keep.id}/create-task`, {
      projectId: w.project.id,
      title: 'x',
      attachmentIds: [png.id],
    });
    expect(errorCode(wrongFile)).toBe('INVALID_REFERENCE');
  });

  it('unlinks feedback when its task is deleted and links it again on restore', async () => {
    const w = await world();
    const task = await w.createTask({ title: 'Doomed' });
    const fb = await w.send();
    await w.api('PUT', `/feedback/${fb.id}/link`, { taskId: task.id });
    expect((await w.api('DELETE', `/tasks/${task.id}`)).statusCode).toBe(204);
    const after = await w.detail('FB-1001');
    expect(after).toMatchObject({ status: 'review', task: null });
    expect(after.activity.at(-1)).toMatchObject({
      kind: 'unlinked',
      data: { reason: 'task_deleted' },
    });

    expect((await w.api('POST', `/tasks/${task.id}/restore`)).statusCode).toBe(200);
    expect(await w.detail('FB-1001')).toMatchObject({ status: 'linked', task: { id: task.id } });

    // Batch delete too; a feedback changed meanwhile is not relinked.
    await w.api('POST', `/projects/${w.project.id}/tasks/batch-delete`, { ids: [task.id] });
    await w.api('PATCH', `/feedback/${fb.id}`, { status: 'closed' });
    await w.api('POST', `/projects/${w.project.id}/tasks/batch-restore`, { ids: [task.id] });
    expect(await w.detail('FB-1001')).toMatchObject({ status: 'closed', task: null });
  });

  it('counts feedback files against the workspace storage quota', async () => {
    const w = await world();
    const before = await storedBytes(ctx.db, w.ws.id);
    await w.form.upload('a.pdf', PDF, 'application/pdf');
    expect(await storedBytes(ctx.db, w.ws.id)).toBe(before + PDF.length);
  });
});
