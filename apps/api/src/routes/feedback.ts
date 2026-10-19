import {
  apiErrorSchema,
  feedbackAssigneesSchema,
  feedbackBatchResultSchema,
  feedbackBatchSchema,
  feedbackCreateTaskResultSchema,
  feedbackCreateTaskSchema,
  feedbackDetailSchema,
  feedbackListQuerySchema,
  feedbackListResponseSchema,
  feedbackNoteSchema,
  feedbackOptionsQuerySchema,
  feedbackOptionsSchema,
  feedbackTaskSuggestionsSchema,
  linkFeedbackSchema,
  parseFeedbackRef,
  plainToRichText,
  updateFeedbackSchema,
} from '@kite/shared';
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { Readable } from 'node:stream';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { canInline, contentDisposition } from '../attachments/http.js';
import {
  loadFeedbackAccess,
  loadProjectAccess,
  loadTaskAccess,
  requireWorkspaceMember,
} from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import {
  attachments,
  feedback,
  feedbackAttachments,
  projects,
  statuses,
  tasks,
  users,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import {
  broadcastFeedbackChanged,
  linkToTask,
  lockFeedback,
  logFeedback,
  requireLinkableTask,
  setStatus,
  taskSnapshots,
  unlinkFromTask,
  type FeedbackChange,
} from '../feedback/link.js';
import {
  buildFeedbackDetail,
  listFeedback,
  taskRefColumns,
  toReportRef,
  toTaskRef,
} from '../feedback/query.js';
import { clientIdOf } from '../realtime/client-id.js';
import { StorageNotFoundError } from '../storage/storage.js';
import { createTask } from '../tasks/create.js';
import { escapeLike } from '../tasks/list.js';
import { mutateTasks } from '../tasks/mutation.js';
import { setTaskAssignees } from '../tasks/patch.js';

const err = apiErrorSchema;
const feedbackParams = z.object({ feedbackId: z.uuid() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The team's feedback inbox. Every active workspace member reads and triages (like projects);
 * outside the workspace everything is 404. Submitter contact details stay here: nothing copies
 * them to a task.
 */
export const feedbackRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** Runs a feedback change in a transaction, then tells the workspace's tabs. */
  async function change<T>(
    request: FastifyRequest,
    workspaceId: string,
    run: (c: FeedbackChange) => Promise<{ value: T; taskIds?: string[] }>,
  ): Promise<T> {
    const { user } = requireAuth(request);
    const result = await app.db.transaction((tx) =>
      run({ tx, actorId: user.id, now: app.clock() }),
    );
    broadcastFeedbackChanged(app, {
      workspaceId,
      actorId: user.id,
      taskIds: result.taskIds ?? [],
      clientId: clientIdOf(request),
    });
    return result.value;
  }

  app.get(
    '/workspaces/:workspaceId/feedback',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'List feedback',
        description:
          '`q` matches the title, body, submitter name or email, or a ref (`FB-1042`). `type` picks a tab; repeat `status` for several chips (OR). Newest first, `limit` per page (50). `typeCounts` apply the search only, `statusCounts` the search and the type.',
        params: z.object({ workspaceId: z.uuid() }),
        querystring: feedbackListQuerySchema,
        response: { 200: feedbackListResponseSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      await requireWorkspaceMember(request, request.params.workspaceId);
      return listFeedback(app.db, request.params.workspaceId, request.query);
    },
  );

  app.get(
    '/workspaces/:workspaceId/feedback/:ref',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Get a feedback item',
        description:
          'By ref (`FB-1042`) or id: the detail panel, with attachments, the linked task, the other reports linked to it and the internal log.',
        params: z.object({ workspaceId: z.uuid(), ref: z.string().min(1).max(60) }),
        response: { 200: feedbackDetailSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId, ref } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const number = parseFeedbackRef(ref);
      const [row] = await app.db
        .select({ id: feedback.id })
        .from(feedback)
        .where(
          and(
            eq(feedback.workspaceId, workspaceId),
            number !== null
              ? eq(feedback.number, number)
              : UUID.test(ref)
                ? eq(feedback.id, ref)
                : sql`false`,
          ),
        )
        .limit(1);
      if (!row) throw httpError(404, 'NOT_FOUND', 'Feedback not found');
      return buildFeedbackDetail(app.db, row.id);
    },
  );

  app.post(
    '/feedback/:feedbackId/read',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Mark feedback as read',
        description:
          'Opening an item marks it read for the whole team (it leaves the sidebar count).',
        params: feedbackParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { feedback: row, workspaceId } = await loadFeedbackAccess(
        request,
        request.params.feedbackId,
      );
      if (!row.isRead) {
        await change(request, workspaceId, async ({ tx }) => {
          await tx.update(feedback).set({ isRead: true }).where(eq(feedback.id, row.id));
          return { value: null };
        });
      }
      return reply.code(204).send(null);
    },
  );

  app.patch(
    '/feedback/:feedbackId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Change a feedback status',
        description: 'Logs `status_change` and marks it read. Closing keeps the task link.',
        params: feedbackParams,
        body: updateFeedbackSchema,
        response: { 200: feedbackDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = await loadFeedbackAccess(request, request.params.feedbackId);
      await change(request, workspaceId, async (c) => {
        const [row] = await lockFeedback(c.tx, workspaceId, [request.params.feedbackId]);
        if (row) await setStatus(c, row, request.body.status);
        return { value: null, taskIds: row?.taskId ? [row.taskId] : [] };
      });
      return buildFeedbackDetail(app.db, request.params.feedbackId);
    },
  );

  app.post(
    '/feedback/:feedbackId/notes',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Add an internal note',
        description: 'Plain text, visible to the team only (never to the submitter).',
        params: feedbackParams,
        body: feedbackNoteSchema,
        response: { 201: feedbackDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = await loadFeedbackAccess(request, request.params.feedbackId);
      await change(request, workspaceId, async (c) => {
        await lockFeedback(c.tx, workspaceId, [request.params.feedbackId]);
        await logFeedback(c, request.params.feedbackId, 'note', {}, request.body.text);
        await c.tx
          .update(feedback)
          .set({ isRead: true, updatedAt: c.now })
          .where(eq(feedback.id, request.params.feedbackId));
        return { value: null };
      });
      return reply.code(201).send(await buildFeedbackDetail(app.db, request.params.feedbackId));
    },
  );

  app.put(
    '/feedback/:feedbackId/link',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Link feedback to a task',
        description:
          'One task per feedback (linking another replaces it); many feedback items can share a task. Sets the status to Linked and logs `linked`. The task must be a live task of the same workspace (404 otherwise). Writes nothing on the task.',
        params: feedbackParams,
        body: linkFeedbackSchema,
        response: { 200: feedbackDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = await loadFeedbackAccess(request, request.params.feedbackId);
      await change(request, workspaceId, async (c) => {
        const task = await requireLinkableTask(c.tx, workspaceId, request.body.taskId);
        const [row] = await lockFeedback(c.tx, workspaceId, [request.params.feedbackId]);
        const taskIds = row ? await linkToTask(c, row, task) : [];
        return { value: null, taskIds };
      });
      return buildFeedbackDetail(app.db, request.params.feedbackId);
    },
  );

  app.delete(
    '/feedback/:feedbackId/link',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Unlink feedback from its task',
        description: 'Puts it back In review and logs `unlinked`. No-op when it isn’t linked.',
        params: feedbackParams,
        response: { 200: feedbackDetailSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = await loadFeedbackAccess(request, request.params.feedbackId);
      await change(request, workspaceId, async (c) => {
        const [row] = await lockFeedback(c.tx, workspaceId, [request.params.feedbackId]);
        const old = row ? await unlinkFromTask(c, row) : null;
        return { value: null, taskIds: old ? [old] : [] };
      });
      return buildFeedbackDetail(app.db, request.params.feedbackId);
    },
  );

  app.put(
    '/feedback/:feedbackId/assignees',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: "Set the linked task's assignees",
        description:
          'Feedback has no assignee of its own: this replaces the linked task’s assignees exactly like `PUT /tasks/:id/assignees` (task activity, followers, notifications) and logs `assignee_change` on the feedback. 409 `NOT_LINKED` when it has no task.',
        params: feedbackParams,
        body: feedbackAssigneesSchema,
        response: { 200: feedbackDetailSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { feedback: found, workspaceId } = await loadFeedbackAccess(
        request,
        request.params.feedbackId,
      );
      if (!found.taskId) throw httpError(409, 'NOT_LINKED', 'Link a task first');
      const { task } = await loadTaskAccess(request, found.taskId);
      const { user } = requireAuth(request);
      await mutateTasks(
        app,
        { projectId: task.projectId, actorId: user.id, clientId: clientIdOf(request) },
        async (m) => {
          const [row] = await lockFeedback(m.tx, workspaceId, [found.id]);
          if (row?.taskId !== task.id) throw httpError(409, 'NOT_LINKED', 'Link a task first');
          const changed = await setTaskAssignees(
            m,
            await m.lockTask(task.id),
            request.body.userIds,
          );
          if (!changed) return;
          const names = request.body.userIds.length
            ? await m.tx
                .select({ id: users.id, name: users.name })
                .from(users)
                .where(inArray(users.id, request.body.userIds))
                .orderBy(users.name)
            : [];
          await logFeedback(
            { tx: m.tx, actorId: user.id, now: m.now },
            found.id,
            'assignee_change',
            {
              task: (await taskSnapshots(m.tx, [task.id])).get(task.id),
              assignees: names,
            },
          );
        },
      );
      broadcastFeedbackChanged(app, {
        workspaceId,
        actorId: user.id,
        taskIds: [task.id],
        clientId: clientIdOf(request),
      });
      return buildFeedbackDetail(app.db, found.id);
    },
  );

  app.post(
    '/feedback/:feedbackId/create-task',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Create a task from feedback',
        description:
          'Creates the task in a project of the same workspace (as `POST /projects/:id/tasks`; the description is plain text), copies the chosen feedback attachments to it (`attachment.added`), and links the feedback (`setLinked` also sets the status to Linked). The submitter’s email and phone are never copied. `notifyOnDone` asks to email the submitter when the task is done (stored; no email service yet). 400 `INVALID_REFERENCE` for an attachment of another feedback.',
        params: feedbackParams,
        body: feedbackCreateTaskSchema,
        response: { 201: feedbackCreateTaskResultSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { feedback: found, workspaceId } = await loadFeedbackAccess(
        request,
        request.params.feedbackId,
      );
      const { project } = await loadProjectAccess(request, request.body.projectId);
      if (project.workspaceId !== workspaceId)
        throw httpError(404, 'NOT_FOUND', 'Project not found');
      const { user } = requireAuth(request);
      const body = request.body;

      const files = body.attachmentIds.length
        ? await app.db
            .select()
            .from(feedbackAttachments)
            .where(
              and(
                inArray(feedbackAttachments.id, body.attachmentIds),
                eq(feedbackAttachments.feedbackId, found.id),
              ),
            )
        : [];
      if (files.length !== new Set(body.attachmentIds).size) {
        throw httpError(400, 'INVALID_REFERENCE', 'Unknown attachment');
      }

      // Copies first (a task attachment is deleted with its file, so they can't share one).
      const taskId = uuidv7();
      const copies: { id: string; key: string; file: (typeof files)[number] }[] = [];
      const discard = async () => {
        for (const c of copies) {
          await app.storage.delete(c.key).catch((error: unknown) => {
            app.log.error({ err: error, key: c.key }, 'Could not delete copied file');
          });
        }
      };
      try {
        for (const file of files) {
          let source: Awaited<ReturnType<typeof app.storage.open>>;
          try {
            source = await app.storage.open(file.storageKey);
          } catch (error) {
            // Seed data has no files: copy what exists.
            if (error instanceof StorageNotFoundError) continue;
            throw error;
          }
          const id = uuidv7();
          const key = `${workspaceId}/${taskId}/${id}`;
          await app.storage.put(key, Readable.from(source.body));
          copies.push({ id, key, file });
        }
      } catch (error) {
        await discard();
        throw error;
      }

      let key: string;
      try {
        key = await mutateTasks(
          app,
          { projectId: project.id, actorId: user.id, clientId: clientIdOf(request) },
          async (m) => {
            await createTask(
              m,
              {
                title: body.title,
                description: plainToRichText(body.description),
                statusId: body.statusId,
                priority: body.priority,
                assigneeIds: body.assigneeIds,
                dueDate: body.dueDate,
              },
              { id: taskId },
            );
            for (const { id, key: storageKey, file } of copies) {
              await m.tx.insert(attachments).values({
                id,
                taskId,
                uploaderId: user.id,
                filename: file.filename,
                mime: file.mime,
                size: file.size,
                storageKey,
                createdAt: m.now,
              });
              m.log(taskId, 'attachment.added', { attachment: { id, filename: file.filename } });
            }
            const c: FeedbackChange = { tx: m.tx, actorId: user.id, now: m.now };
            const [row] = await lockFeedback(m.tx, workspaceId, [found.id]);
            const task = (await taskSnapshots(m.tx, [taskId])).get(taskId);
            if (!row || !task) throw new Error('Feedback or new task missing');
            await linkToTask(c, row, task, { setLinked: body.setLinked });
            await m.tx
              .update(feedback)
              .set({ notifyOnDone: body.notifyOnDone })
              .where(eq(feedback.id, found.id));
            return task.key;
          },
        );
      } catch (error) {
        await discard();
        throw error;
      }
      broadcastFeedbackChanged(app, {
        workspaceId,
        actorId: user.id,
        taskIds: [taskId],
        clientId: clientIdOf(request),
      });
      return reply.code(201).send({
        feedback: await buildFeedbackDetail(app.db, found.id),
        task: { id: taskId, key },
      });
    },
  );

  app.post(
    '/workspaces/:workspaceId/feedback/batch',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Change many feedback items',
        description:
          'Inbox multi-select and "Close all": set a status, link to one task, or unlink, in one transaction with the same log rows as the single routes. Every id must be feedback of this workspace (404 otherwise, nothing changes). Returns how many changed.',
        params: z.object({ workspaceId: z.uuid() }),
        body: feedbackBatchSchema,
        response: { 200: feedbackBatchResultSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { ids, change: what } = request.body;
      return change(request, workspaceId, async (c) => {
        const rows = await lockFeedback(c.tx, workspaceId, ids);
        const taskIds: string[] = [];
        let changed = 0;
        if (what.action === 'link') {
          const task = await requireLinkableTask(c.tx, workspaceId, what.taskId);
          for (const row of rows) {
            const touched = await linkToTask(c, row, task);
            if (touched.length > 0) changed += 1;
            taskIds.push(...touched);
          }
        } else if (what.action === 'unlink') {
          for (const row of rows) {
            const old = await unlinkFromTask(c, row);
            if (old) {
              changed += 1;
              taskIds.push(old);
            }
          }
        } else {
          for (const row of rows) {
            if (await setStatus(c, row, what.status)) changed += 1;
            if (row.taskId) taskIds.push(row.taskId);
          }
        }
        return { value: { changed }, taskIds };
      });
    },
  );

  app.get(
    '/feedback/:feedbackId/task-suggestions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Tasks similar to a feedback item',
        description:
          'The link picker’s "Similar tasks": up to 5 open tasks of the workspace whose title is like the feedback title (trigram similarity), most similar first. Archived projects and the already linked task are left out.',
        params: feedbackParams,
        response: { 200: feedbackTaskSuggestionsSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { feedback: row, workspaceId } = await loadFeedbackAccess(
        request,
        request.params.feedbackId,
      );
      const similarity = sql`similarity(${tasks.title}, ${row.title})`;
      const rows = await app.db
        .select(taskRefColumns)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .innerJoin(statuses, eq(statuses.id, tasks.statusId))
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            isNull(projects.archivedAt),
            isNull(tasks.deletedAt),
            ne(statuses.category, 'done'),
            row.taskId ? ne(tasks.id, row.taskId) : undefined,
            sql`${similarity} > 0.15`,
          ),
        )
        .orderBy(desc(similarity), desc(tasks.updatedAt))
        .limit(5);
      return { tasks: rows.map(toTaskRef) };
    },
  );

  app.get(
    '/feedback/:feedbackId/attachments/:attachmentId/download',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Download a feedback attachment',
        description:
          'Like task attachments: a download with the original name, or inline for PNG/JPEG/GIF/WebP with `inline=true`. 404 `FILE_MISSING` when the file itself is gone.',
        params: feedbackParams.extend({ attachmentId: z.uuid() }),
        querystring: z.object({ inline: z.stringbool().default(false) }),
        response: { 200: z.unknown().describe('The file'), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { feedback: row } = await loadFeedbackAccess(request, request.params.feedbackId);
      const [file] = await app.db
        .select()
        .from(feedbackAttachments)
        .where(
          and(
            eq(feedbackAttachments.id, request.params.attachmentId),
            eq(feedbackAttachments.feedbackId, row.id),
          ),
        )
        .limit(1);
      if (!file) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
      let stored: Awaited<ReturnType<typeof app.storage.open>>;
      try {
        stored = await app.storage.open(file.storageKey);
      } catch (error) {
        if (error instanceof StorageNotFoundError) {
          throw httpError(404, 'FILE_MISSING', 'The file is no longer available');
        }
        throw error;
      }
      const inline = request.query.inline && canInline(file.mime);
      return reply
        .header('content-type', file.mime)
        .header('content-length', stored.size)
        .header(
          'content-disposition',
          contentDisposition(file.filename, inline ? 'inline' : 'attachment'),
        )
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'private, no-cache')
        .send(stored.body);
    },
  );

  app.get(
    '/tasks/:taskId/feedback-options',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Feedback a task can link',
        description:
          'The task drawer’s "+ Link feedback": up to 20 open (not closed) feedback items of the task’s workspace that aren’t linked to any task, newest first; `q` matches the title, ref, submitter name or email.',
        params: z.object({ taskId: z.uuid() }),
        querystring: feedbackOptionsQuerySchema,
        response: { 200: feedbackOptionsSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = await loadTaskAccess(request, request.params.taskId);
      const q = request.query.q;
      const contains = q ? `%${escapeLike(q)}%` : null;
      const number = q ? parseFeedbackRef(q) : null;
      const rows = await app.db
        .select()
        .from(feedback)
        .where(
          and(
            eq(feedback.workspaceId, workspaceId),
            isNull(feedback.taskId),
            ne(feedback.status, 'closed'),
            contains
              ? or(
                  ilike(feedback.title, contains),
                  ilike(feedback.submitterName, contains),
                  ilike(feedback.email, contains),
                  sql`('FB-' || ${feedback.number}) ilike ${contains}`,
                  number !== null ? eq(feedback.number, number) : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(desc(feedback.createdAt))
        .limit(20);
      return { items: rows.map(toReportRef) };
    },
  );

  app.put(
    '/tasks/:taskId/feedback/:feedbackId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Link feedback from the task',
        description: 'Same as `PUT /feedback/:id/link`, from the task drawer.',
        params: z.object({ taskId: z.uuid(), feedbackId: z.uuid() }),
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = await loadTaskAccess(request, request.params.taskId);
      const { workspaceId: feedbackWorkspace } = await loadFeedbackAccess(
        request,
        request.params.feedbackId,
      );
      if (feedbackWorkspace !== workspaceId)
        throw httpError(404, 'NOT_FOUND', 'Feedback not found');
      await change(request, workspaceId, async (c) => {
        const task = await requireLinkableTask(c.tx, workspaceId, request.params.taskId);
        const [row] = await lockFeedback(c.tx, workspaceId, [request.params.feedbackId]);
        return { value: null, taskIds: row ? await linkToTask(c, row, task) : [] };
      });
      return reply.code(204).send(null);
    },
  );

  done();
};
