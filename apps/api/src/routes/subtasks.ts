import {
  apiErrorSchema,
  createSubtaskSchema,
  moveSchema,
  subtaskSchema,
  updateSubtaskSchema,
} from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadSubtaskAccess, loadTaskAccess } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { movePosition } from '../db/position.js';
import { one } from '../db/rows.js';
import { subtasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { mutateTasks, type TaskMutation } from '../tasks/mutation.js';
import { requireMembers } from '../tasks/refs.js';
import { endOfSubtasks, getSubtask, listSubtasks, startOfSubtasks } from '../tasks/subtasks.js';

const err = apiErrorSchema;
const taskParams = z.object({ taskId: z.uuid() });
const subtaskParams = z.object({ subtaskId: z.uuid() });

export const subtaskRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** Locks the parent task (404 once it's deleted) and the subtask, inside a mutation. */
  async function lockSubtask(m: TaskMutation, taskId: string, subtaskId: string) {
    await m.lockTask(taskId);
    const [subtask] = await m.tx
      .select()
      .from(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
      .for('update');
    if (!subtask) throw httpError(404, 'NOT_FOUND', 'Subtask not found');
    return subtask;
  }

  async function assigneeId(m: TaskMutation, id: string | null | undefined) {
    if (!id) return null;
    await requireMembers(m.tx, m.project.workspaceId, [id]);
    return id;
  }

  const dto = async (subtaskId: string) => {
    const subtask = await getSubtask(app.db, subtaskId);
    if (!subtask) throw httpError(404, 'NOT_FOUND', 'Subtask not found');
    return subtask;
  };

  app.get(
    '/tasks/:taskId/subtasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Subtasks'],
        summary: 'List subtasks',
        description: 'By position.',
        params: taskParams,
        response: { 200: z.array(subtaskSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { task } = await loadTaskAccess(request, request.params.taskId);
      return listSubtasks(app.db, task.id);
    },
  );

  app.post(
    '/tasks/:taskId/subtasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Subtasks'],
        summary: 'Add a subtask',
        description:
          'At the end (or `position: "top"`). The assignee must be a workspace member (400 `INVALID_REFERENCE`). Logs `subtask.added`.',
        params: taskParams,
        body: createSubtaskSchema,
        response: { 201: subtaskSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { task, project } = await loadTaskAccess(request, request.params.taskId);
      const { user } = requireAuth(request);
      const body = request.body;

      const id = await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        await m.lockTask(task.id);
        const subtask = one(
          await m.tx
            .insert(subtasks)
            .values({
              taskId: task.id,
              title: body.title,
              assigneeId: await assigneeId(m, body.assigneeId),
              dueDate: body.dueDate ?? null,
              position:
                body.position === 'top'
                  ? await startOfSubtasks(m.tx, task.id)
                  : await endOfSubtasks(m.tx, task.id),
            })
            .returning(),
          'subtask',
        );
        m.log(task.id, 'subtask.added', { subtask: { id: subtask.id, title: subtask.title } });
        await m.touch(task.id);
        m.emit('subtask.changed', task.id, { subtaskId: subtask.id });
        return subtask.id;
      });
      return reply.code(201).send(await dto(id));
    },
  );

  app.patch(
    '/subtasks/:subtaskId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Subtasks'],
        summary: 'Update a subtask',
        description:
          'Title, assignee, due date, done. Checking it off logs `subtask.completed`; other changes (including unchecking) log nothing. Unchanged values are ignored.',
        params: subtaskParams,
        body: updateSubtaskSchema,
        response: { 200: subtaskSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { subtask: found, project } = await loadSubtaskAccess(
        request,
        request.params.subtaskId,
      );
      const { user } = requireAuth(request);
      const body = request.body;

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        const subtask = await lockSubtask(m, found.taskId, found.id);
        const patch: Partial<typeof subtasks.$inferInsert> = {};
        if (body.title !== undefined && body.title !== subtask.title) patch.title = body.title;
        if (body.assigneeId !== undefined && body.assigneeId !== subtask.assigneeId) {
          patch.assigneeId = await assigneeId(m, body.assigneeId);
        }
        if (body.dueDate !== undefined && body.dueDate !== subtask.dueDate) {
          patch.dueDate = body.dueDate;
        }
        if (body.done !== undefined && body.done !== subtask.done) {
          patch.done = body.done;
          if (body.done) {
            m.log(subtask.taskId, 'subtask.completed', {
              subtask: { id: subtask.id, title: patch.title ?? subtask.title },
            });
          }
        }
        if (Object.keys(patch).length === 0) return;

        await m.tx.update(subtasks).set(patch).where(eq(subtasks.id, subtask.id));
        await m.touch(subtask.taskId);
        m.emit('subtask.changed', subtask.taskId, { subtaskId: subtask.id });
      });
      return dto(found.id);
    },
  );

  app.post(
    '/subtasks/:subtaskId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Subtasks'],
        summary: 'Reorder a subtask',
        description:
          'Between the neighbors the client saw after the drop: right after `prevId` (or right before `nextId`; at the end with neither). Neighbors must be subtasks of the same task, `prevId` before `nextId` (400 `INVALID_MOVE`). No activity is logged.',
        params: subtaskParams,
        body: moveSchema,
        response: { 200: subtaskSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { subtask: found, project } = await loadSubtaskAccess(
        request,
        request.params.subtaskId,
      );
      const { user } = requireAuth(request);

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        const subtask = await lockSubtask(m, found.taskId, found.id);
        const siblings = await m.tx
          .select({ id: subtasks.id, position: subtasks.position })
          .from(subtasks)
          .where(eq(subtasks.taskId, subtask.taskId));
        const position = movePosition(siblings, subtask.id, request.body);
        if (position === subtask.position) return;
        await m.tx.update(subtasks).set({ position }).where(eq(subtasks.id, subtask.id));
        await m.touch(subtask.taskId);
        m.emit('subtask.changed', subtask.taskId, { subtaskId: subtask.id });
      });
      return dto(found.id);
    },
  );

  app.delete(
    '/subtasks/:subtaskId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Subtasks'],
        summary: 'Delete a subtask',
        description: 'Permanent. No activity is logged.',
        params: subtaskParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { subtask: found, project } = await loadSubtaskAccess(
        request,
        request.params.subtaskId,
      );
      const { user } = requireAuth(request);

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        const subtask = await lockSubtask(m, found.taskId, found.id);
        await m.tx.delete(subtasks).where(eq(subtasks.id, subtask.id));
        await m.touch(subtask.taskId);
        m.emit('subtask.changed', subtask.taskId, { subtaskId: subtask.id });
      });
      return reply.code(204).send(null);
    },
  );

  done();
};
