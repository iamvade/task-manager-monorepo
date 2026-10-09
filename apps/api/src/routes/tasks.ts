import {
  activityPayloadSchemas,
  apiErrorSchema,
  completeTaskSchema,
  createTaskSchema,
  moveTaskSchema,
  parseTaskKey,
  richTextToPlain,
  setTaskAssigneesSchema,
  setTaskTagsSchema,
  spaceTaskListQuerySchema,
  taskDetailSchema,
  taskListItemSchema,
  taskListQuerySchema,
  taskRefQuerySchema,
  updateTaskSchema,
} from '@kite/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  findTaskIdByKey,
  loadProjectAccess,
  loadSpaceAccess,
  loadTaskAccess,
} from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { movePosition } from '../db/position.js';
import { one } from '../db/rows.js';
import {
  activity,
  projects,
  sprints,
  taskAssignees,
  taskFollowers,
  taskTags,
  tasks,
  tags,
  users,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { listStatuses } from '../projects/statuses.js';
import { buildTaskDetail } from '../tasks/detail.js';
import { stableJson } from '../tasks/json.js';
import { getTaskListItem, listProjectTasks, listSpaceTasks } from '../tasks/list.js';
import { mutateTasks } from '../tasks/mutation.js';
import {
  changeStatus,
  endOfStatus,
  requireMembers,
  requireSprintIn,
  requireStatusIn,
  requireTags,
  startOfStatus,
  statusSnapshot,
} from '../tasks/refs.js';

const err = apiErrorSchema;
const taskParams = z.object({ taskId: z.uuid() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILTERS_DOC =
  'Repeat a parameter for several values (`?statusId=a&statusId=b`); values of one filter are OR-ed, filters are AND-ed. `assigneeId=unassigned` matches tasks without assignees. `q` matches title substrings and similar words (trigram). Sorts: `position` (status order, then board order), `dueDate` (no date last), `priority` (urgent first when ascending), `createdAt`. Deleted tasks never appear.';

export const taskRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** The task in the URL, access-checked, plus the caller's id for the mutation. */
  async function target(request: FastifyRequest, taskId: string, includeDeleted = false) {
    const access = await loadTaskAccess(request, taskId, { includeDeleted });
    const { user } = requireAuth(request);
    return { projectId: access.project.id, actorId: user.id };
  }

  const listItem = async (taskId: string) => {
    const item = await getTaskListItem(app.db, taskId);
    if (!item) throw httpError(404, 'NOT_FOUND', 'Task not found');
    return item;
  };

  app.get(
    '/projects/:projectId/tasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'List tasks of a project',
        description: `${FILTERS_DOC} Includes done tasks unless \`includeDone=false\`.`,
        params: z.object({ projectId: z.uuid() }),
        querystring: taskListQuerySchema,
        response: { 200: z.array(taskListItemSchema), 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      return listProjectTasks(app.db, project.id, request.query);
    },
  );

  app.get(
    '/spaces/:spaceId/tasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'List tasks of a space',
        description: `Tasks of every non-archived project in the space (space-level List/Board/Calendar); \`projectId\` narrows to some projects. ${FILTERS_DOC} With \`sort=position\` tasks are grouped by project.`,
        params: z.object({ spaceId: z.uuid() }),
        querystring: spaceTaskListQuerySchema,
        response: { 200: z.array(taskListItemSchema), 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { space } = await loadSpaceAccess(request, request.params.spaceId);
      return listSpaceTasks(app.db, space.id, request.query);
    },
  );

  app.get(
    '/tasks/:taskRef',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Get a task',
        description:
          'By id or by key (`APP-142`). Keys are unique per workspace: pass `workspaceId` when the caller belongs to several, otherwise a key found in more than one answers 409 `TASK_KEY_AMBIGUOUS`. Deleted tasks are returned with `deletedAt` set.',
        params: z.object({ taskRef: z.string().max(64) }),
        querystring: taskRefQuerySchema,
        response: { 200: taskDetailSchema, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { taskRef } = request.params;
      let taskId: string;
      if (UUID.test(taskRef)) {
        taskId = (await loadTaskAccess(request, taskRef, { includeDeleted: true })).task.id;
      } else {
        const key = parseTaskKey(taskRef);
        if (!key) throw httpError(404, 'NOT_FOUND', 'Task not found');
        taskId = await findTaskIdByKey(request, key, request.query.workspaceId);
      }
      return buildTaskDetail(app.db, taskId);
    },
  );

  app.post(
    '/projects/:projectId/tasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Create a task',
        description:
          'Takes the next number of the project (`APP-143`). Defaults: the first To Do status, no priority, at the end of the status (`position: "top"` for the top). Assignees must be workspace members, tags workspace tags, status and sprint of this project (400 `INVALID_REFERENCE`). The creator and assignees follow the task.',
        params: z.object({ projectId: z.uuid() }),
        body: createTaskSchema,
        response: { 201: taskDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const { user } = requireAuth(request);
      const body = request.body;

      const taskId = await mutateTasks(
        app,
        { projectId: project.id, actorId: user.id },
        async (m) => {
          const { tx } = m;
          const workspaceId = m.project.workspaceId;
          const statusRows = await listStatuses(tx, project.id);
          const status = body.statusId
            ? await requireStatusIn(tx, project.id, body.statusId)
            : (statusRows.find((s) => s.category === 'todo') ?? statusRows[0]);
          if (!status) throw new Error(`Project ${project.id} has no statuses`);
          if (body.sprintId) await requireSprintIn(tx, project.id, body.sprintId);
          const assignees = await requireMembers(tx, workspaceId, body.assigneeIds ?? []);
          const tagRows = await requireTags(tx, workspaceId, body.tagIds ?? []);

          // The project row is locked, so this number is ours.
          const number = m.project.taskSeq + 1;
          await tx.update(projects).set({ taskSeq: number }).where(eq(projects.id, project.id));
          const description = body.description ?? null;
          const task = one(
            await tx
              .insert(tasks)
              .values({
                projectId: project.id,
                number,
                statusId: status.id,
                sprintId: body.sprintId ?? null,
                title: body.title,
                description,
                descriptionText: description ? richTextToPlain(description) : '',
                priority: body.priority ?? 'none',
                startDate: body.startDate ?? null,
                dueDate: body.dueDate ?? null,
                position:
                  body.position === 'top'
                    ? await startOfStatus(tx, status.id)
                    : await endOfStatus(tx, status.id),
                createdBy: user.id,
                completedAt: status.category === 'done' ? m.now : null,
                createdAt: m.now,
                updatedAt: m.now,
              })
              .returning({ id: tasks.id }),
            'task',
          );
          if (assignees.length > 0) {
            await tx
              .insert(taskAssignees)
              .values(assignees.map((a) => ({ taskId: task.id, userId: a.id })));
          }
          if (tagRows.length > 0) {
            await tx
              .insert(taskTags)
              .values(tagRows.map((t) => ({ taskId: task.id, tagId: t.id })));
          }
          const followerIds = new Set([user.id, ...assignees.map((a) => a.id)]);
          await tx
            .insert(taskFollowers)
            .values([...followerIds].map((userId) => ({ taskId: task.id, userId })));

          m.log(task.id, 'task.created', { status: statusSnapshot(status) });
          m.emit('task.created', task.id, { assigneeIds: assignees.map((a) => a.id) });
          return task.id;
        },
      );
      return reply.code(201).send(await buildTaskDetail(app.db, taskId));
    },
  );

  app.patch(
    '/tasks/:taskId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Update a task',
        description:
          'Title, description (TipTap JSON; its plain text is stored for search), status, priority, start/due date, sprint. Writes one activity row per changed field; unchanged values are ignored. A new status puts the task at the end of that status; entering a done status sets `completedAt`, leaving it clears it.',
        params: taskParams,
        body: updateTaskSchema,
        response: { 200: taskDetailSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId);
      const body = request.body;

      await mutateTasks(app, scope, async (m) => {
        const { tx } = m;
        const task = await m.lockTask(request.params.taskId);
        const patch: Partial<typeof tasks.$inferInsert> = {};

        if (body.title !== undefined && body.title !== task.title) {
          patch.title = body.title;
          m.log(task.id, 'title.changed', { from: task.title, to: body.title });
        }
        if (
          body.description !== undefined &&
          stableJson(body.description) !== stableJson(task.description)
        ) {
          patch.description = body.description;
          patch.descriptionText = body.description ? richTextToPlain(body.description) : '';
          m.log(task.id, 'description.changed', {});
        }
        if (body.priority !== undefined && body.priority !== task.priority) {
          patch.priority = body.priority;
          m.log(task.id, 'priority.changed', { from: task.priority, to: body.priority });
        }
        if (body.startDate !== undefined && body.startDate !== task.startDate) {
          patch.startDate = body.startDate;
          m.log(task.id, 'start.changed', { from: task.startDate, to: body.startDate });
        }
        if (body.dueDate !== undefined && body.dueDate !== task.dueDate) {
          patch.dueDate = body.dueDate;
          m.log(task.id, 'due.changed', { from: task.dueDate, to: body.dueDate });
        }
        if (body.sprintId !== undefined && body.sprintId !== task.sprintId) {
          const to = body.sprintId
            ? await requireSprintIn(tx, task.projectId, body.sprintId)
            : null;
          const [from] = task.sprintId
            ? await tx.select().from(sprints).where(eq(sprints.id, task.sprintId))
            : [];
          patch.sprintId = body.sprintId;
          m.log(task.id, 'sprint.changed', {
            from: from ? { id: from.id, name: from.name } : null,
            to: to ? { id: to.id, name: to.name } : null,
          });
        }
        if (body.statusId !== undefined && body.statusId !== task.statusId) {
          const to = await requireStatusIn(tx, task.projectId, body.statusId);
          const from = await requireStatusIn(tx, task.projectId, task.statusId);
          Object.assign(patch, await changeStatus(m, task, from, to));
        }

        if (Object.keys(patch).length === 0) return;
        await tx
          .update(tasks)
          .set({ ...patch, updatedAt: m.now })
          .where(eq(tasks.id, task.id));
        m.emit('task.updated', task.id);
      });
      return buildTaskDetail(app.db, request.params.taskId);
    },
  );

  app.post(
    '/tasks/:taskId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Move a task (board drag, list reorder)',
        description:
          'Into `statusId` (a status of the same project) between the neighbors the client saw after the drop: the task lands right after `prevId` (or right before `nextId` when only that is given; at the end with neither). Neighbors must be tasks of the target status, `prevId` before `nextId` (400 `INVALID_MOVE`). Only the moved task changes. A status change logs `status.changed` and updates `completedAt`; a pure reorder writes no activity.',
        params: taskParams,
        body: moveTaskSchema,
        response: { 200: taskListItemSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId);
      const { statusId, ...move } = request.body;

      await mutateTasks(app, scope, async (m) => {
        const { tx } = m;
        const task = await m.lockTask(request.params.taskId);
        const to = await requireStatusIn(tx, task.projectId, statusId);
        const column = await tx
          .select({ id: tasks.id, position: tasks.position, deletedAt: tasks.deletedAt })
          .from(tasks)
          .where(eq(tasks.statusId, to.id));
        const position = movePosition(
          column.map((t) => ({ id: t.id, position: t.position, live: t.deletedAt === null })),
          task.id,
          move,
        );
        const patch =
          to.id === task.statusId
            ? { position }
            : await changeStatus(
                m,
                task,
                await requireStatusIn(tx, task.projectId, task.statusId),
                to,
                position,
              );
        await tx.update(tasks).set(patch).where(eq(tasks.id, task.id));
        m.emit('task.moved', task.id);
      });
      return listItem(request.params.taskId);
    },
  );

  app.put(
    '/tasks/:taskId/assignees',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Set assignees',
        description:
          'Replaces the set. Every user must be a workspace member (400 `INVALID_REFERENCE`). Logs `assignee.added` / `assignee.removed` per change; new assignees follow the task.',
        params: taskParams,
        body: setTaskAssigneesSchema,
        response: { 200: taskListItemSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId);

      await mutateTasks(app, scope, async (m) => {
        const { tx } = m;
        const task = await m.lockTask(request.params.taskId);
        const next = await requireMembers(tx, m.project.workspaceId, request.body.userIds);
        const current = await tx
          .select({ id: users.id, name: users.name })
          .from(taskAssignees)
          .innerJoin(users, eq(users.id, taskAssignees.userId))
          .where(eq(taskAssignees.taskId, task.id))
          .orderBy(users.name);
        const nextIds = new Set(next.map((u) => u.id));
        const currentIds = new Set(current.map((u) => u.id));
        const removed = current.filter((u) => !nextIds.has(u.id));
        const added = next.filter((u) => !currentIds.has(u.id));
        if (removed.length === 0 && added.length === 0) return;

        if (removed.length > 0) {
          await tx.delete(taskAssignees).where(
            and(
              eq(taskAssignees.taskId, task.id),
              inArray(
                taskAssignees.userId,
                removed.map((u) => u.id),
              ),
            ),
          );
        }
        if (added.length > 0) {
          const rows = added.map((u) => ({ taskId: task.id, userId: u.id }));
          await tx.insert(taskAssignees).values(rows);
          await tx.insert(taskFollowers).values(rows).onConflictDoNothing();
        }
        for (const user of removed) m.log(task.id, 'assignee.removed', { user });
        for (const user of added) m.log(task.id, 'assignee.added', { user });
        await tx.update(tasks).set({ updatedAt: m.now }).where(eq(tasks.id, task.id));
        m.emit('task.updated', task.id);
      });
      return listItem(request.params.taskId);
    },
  );

  app.put(
    '/tasks/:taskId/tags',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Set tags',
        description:
          'Replaces the set. Tags must belong to the workspace (400 `INVALID_REFERENCE`). Logs `tag.added` / `tag.removed` per change.',
        params: taskParams,
        body: setTaskTagsSchema,
        response: { 200: taskListItemSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId);

      await mutateTasks(app, scope, async (m) => {
        const { tx } = m;
        const task = await m.lockTask(request.params.taskId);
        const next = await requireTags(tx, m.project.workspaceId, request.body.tagIds);
        const current = await tx
          .select({ id: tags.id, name: tags.name, color: tags.color })
          .from(taskTags)
          .innerJoin(tags, eq(tags.id, taskTags.tagId))
          .where(eq(taskTags.taskId, task.id))
          .orderBy(tags.name);
        const nextIds = new Set(next.map((t) => t.id));
        const currentIds = new Set(current.map((t) => t.id));
        const removed = current.filter((t) => !nextIds.has(t.id));
        const added = next.filter((t) => !currentIds.has(t.id));
        if (removed.length === 0 && added.length === 0) return;

        if (removed.length > 0) {
          await tx.delete(taskTags).where(
            and(
              eq(taskTags.taskId, task.id),
              inArray(
                taskTags.tagId,
                removed.map((t) => t.id),
              ),
            ),
          );
        }
        if (added.length > 0) {
          await tx.insert(taskTags).values(added.map((t) => ({ taskId: task.id, tagId: t.id })));
        }
        for (const tag of removed) m.log(task.id, 'tag.removed', { tag });
        for (const tag of added) m.log(task.id, 'tag.added', { tag });
        await tx.update(tasks).set({ updatedAt: m.now }).where(eq(tasks.id, task.id));
        m.emit('task.updated', task.id);
      });
      return listItem(request.params.taskId);
    },
  );

  app.post(
    '/tasks/:taskId/complete',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Complete or reopen a task (list checkbox)',
        description:
          'Without a body it toggles; `{ done }` sets the state (no-op when already there). Completing moves the task to the first done status; reopening moves it back to the status it had before Done (or the first To Do status). The task goes to the end of the new status. 409 `NO_DONE_STATUS` when the project has no done status.',
        params: taskParams,
        body: completeTaskSchema.nullish(),
        response: { 200: taskListItemSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId);

      await mutateTasks(app, scope, async (m) => {
        const { tx } = m;
        const task = await m.lockTask(request.params.taskId);
        const statusRows = await listStatuses(tx, task.projectId);
        const current = statusRows.find((s) => s.id === task.statusId);
        if (!current) throw new Error(`Status ${task.statusId} missing`);
        const isDone = current.category === 'done';
        const done = request.body?.done ?? !isDone;
        if (done === isDone) return;

        let to: (typeof statusRows)[number] | undefined;
        if (done) {
          to = statusRows.find((s) => s.category === 'done');
          if (!to) throw httpError(409, 'NO_DONE_STATUS', 'This project has no done status');
        } else {
          // The status the task left when it entered the current (done) one.
          const [last] = await tx
            .select({ payload: activity.payload })
            .from(activity)
            .where(
              and(
                eq(activity.taskId, task.id),
                eq(activity.type, 'status.changed'),
                sql`${activity.payload} -> 'to' ->> 'id' = ${current.id}`,
              ),
            )
            .orderBy(desc(activity.createdAt), desc(activity.id))
            .limit(1);
          const parsed = activityPayloadSchemas['status.changed'].safeParse(last?.payload);
          const previousId = parsed.success ? parsed.data.from.id : undefined;
          const open = statusRows.filter((s) => s.category !== 'done');
          to =
            open.find((s) => s.id === previousId) ??
            open.find((s) => s.category === 'todo') ??
            open[0];
          if (!to) throw httpError(409, 'NO_OPEN_STATUS', 'This project has no open status');
        }
        await tx
          .update(tasks)
          .set(await changeStatus(m, task, current, to))
          .where(eq(tasks.id, task.id));
        m.emit('task.updated', task.id);
      });
      return listItem(request.params.taskId);
    },
  );

  app.delete(
    '/tasks/:taskId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Delete a task',
        description: 'Soft delete: the task leaves every list and can be restored.',
        params: taskParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const scope = await target(request, request.params.taskId);
      await mutateTasks(app, scope, async (m) => {
        const task = await m.lockTask(request.params.taskId);
        await m.tx.update(tasks).set({ deletedAt: m.now }).where(eq(tasks.id, task.id));
        m.log(task.id, 'task.deleted', {});
        m.emit('task.deleted', task.id);
      });
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/tasks/:taskId/restore',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tasks'],
        summary: 'Restore a deleted task',
        description:
          'Back to its old status and position. 409 `TASK_NOT_DELETED` when it is not deleted.',
        params: taskParams,
        response: { 200: taskDetailSchema, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const scope = await target(request, request.params.taskId, true);
      await mutateTasks(app, scope, async (m) => {
        const task = await m.lockTask(request.params.taskId, { includeDeleted: true });
        if (!task.deletedAt) throw httpError(409, 'TASK_NOT_DELETED', 'The task is not deleted');
        await m.tx.update(tasks).set({ deletedAt: null }).where(eq(tasks.id, task.id));
        m.log(task.id, 'task.restored', {});
        m.emit('task.restored', task.id);
      });
      return buildTaskDetail(app.db, request.params.taskId);
    },
  );
  done();
};
