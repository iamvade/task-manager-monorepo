import {
  apiErrorSchema,
  canManageSprint,
  createSprintSchema,
  sprintSchema,
  sprintWithUsageSchema,
  updateSprintSchema,
} from '@kite/shared';
import { and, asc, count, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadSprintAccess, requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import { projects, sprintMemberships, sprintProjects, sprints, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';
import { insertSprint, projectIdsOf, sprintDto, toSprintDto } from '../sprints/query.js';

const err = apiErrorSchema;
const sprintParams = z.object({ sprintId: z.uuid() });

/**
 * 400 `INVALID_REFERENCE` unless every id is a project of the workspace; `added` ones (new to the
 * sprint) must not be archived. Key-share locks them first, so creating a sprint takes project
 * locks before the workspace lock, like applying a template.
 */
async function requireSprintProjects(
  db: DbOrTx,
  workspaceId: string,
  ids: readonly string[],
  added: readonly string[] = ids,
) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: projects.id, archivedAt: projects.archivedAt })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, [...ids])))
    .for('key share');
  const found = new Map(rows.map((r) => [r.id, r]));
  const bad = ids.some((id) => !found.has(id)) || added.some((id) => found.get(id)?.archivedAt);
  if (bad) throw httpError(400, 'INVALID_REFERENCE', 'Pick active projects of this workspace');
}

/** Tells the workspace's other tabs to refetch sprints (and the projects/tasks that show them). */
function broadcastSprintsChanged(
  app: FastifyInstance,
  request: FastifyRequest,
  workspaceId: string,
) {
  const { user } = requireAuth(request);
  app.reportCache.invalidate(workspaceId);
  app.realtime.broadcaster.publish({
    to: { workspaceId },
    exceptClientId: clientIdOf(request),
    message: {
      type: 'sprints.changed',
      workspaceId,
      actorId: user.id,
      at: new Date().toISOString(),
    },
  });
}

export const sprintRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/sprints',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Sprints'],
        summary: 'List sprints',
        description:
          'Every sprint of the workspace by start date, with its projects and the number of live ' +
          'tasks in it.',
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(sprintWithUsageSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const used = app.db
        .select({ sprintId: tasks.sprintId, n: count().as('n') })
        .from(tasks)
        .where(isNull(tasks.deletedAt))
        .groupBy(tasks.sprintId)
        .as('used');
      const rows = await app.db
        .select({ sprint: sprints, taskCount: sql<number>`coalesce(${used.n}, 0)`.mapWith(Number) })
        .from(sprints)
        .leftJoin(used, eq(used.sprintId, sprints.id))
        .where(eq(sprints.workspaceId, workspaceId))
        .orderBy(asc(sprints.startDate), asc(sprints.number));
      const ids = await projectIdsOf(
        app.db,
        rows.map((r) => r.sprint.id),
      );
      return rows.map((r) => ({
        ...toSprintDto(r.sprint, ids.get(r.sprint.id) ?? []),
        taskCount: r.taskCount,
      }));
    },
  );

  app.post(
    '/workspaces/:workspaceId/sprints',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Sprints'],
        summary: 'Create a sprint',
        description:
          'Any member. Takes the next number of the workspace ("Sprint 14"); without a name it ' +
          'shows as "Sprint {number}". Tasks of `projectIds` (active projects of the workspace, ' +
          'else 400 `INVALID_REFERENCE`) can then be put in it.',
        params: z.object({ workspaceId: z.uuid() }),
        body: createSprintSchema,
        response: { 201: sprintSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { user } = requireAuth(request);
      await requireWorkspaceMember(request, workspaceId);
      const { projectIds, ...rest } = request.body;
      const sprint = await app.db.transaction(async (tx) => {
        await requireSprintProjects(tx, workspaceId, projectIds);
        return insertSprint(tx, { workspaceId, ...rest, projectIds, createdBy: user.id });
      });
      broadcastSprintsChanged(app, request, workspaceId);
      return reply.code(201).send(toSprintDto(sprint, [...projectIds].sort()));
    },
  );

  app.patch(
    '/sprints/:sprintId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Sprints'],
        summary: 'Edit a sprint',
        description:
          'Admins, owner and the member who created it (else 403). `projectIds` replaces the ' +
          'list: added projects must be active projects of the workspace (400 ' +
          '`INVALID_REFERENCE`); a project can only be removed while none of its tasks (deleted ' +
          'ones included) is in the sprint (409 `SPRINT_PROJECT_IN_USE`). No task activity.',
        params: sprintParams,
        body: updateSprintSchema,
        response: { 200: sprintSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { sprint, role } = await loadSprintAccess(request, request.params.sprintId);
      const { user } = requireAuth(request);
      if (!canManageSprint(role, sprint.createdBy, user.id)) {
        throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this');
      }
      const { projectIds, ...fields } = request.body;
      const startDate = fields.startDate ?? sprint.startDate;
      const endDate = fields.endDate ?? sprint.endDate;
      if (endDate < startDate) {
        throw httpError(400, 'VALIDATION_ERROR', 'The end date must not be before the start date');
      }
      const updated = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(sprints)
          .where(eq(sprints.id, sprint.id))
          .for('update');
        if (!row) throw httpError(404, 'NOT_FOUND', 'Sprint not found');
        if (projectIds) {
          const current = (await projectIdsOf(tx, [sprint.id])).get(sprint.id) ?? [];
          const added = projectIds.filter((id) => !current.includes(id));
          const removed = current.filter((id) => !projectIds.includes(id));
          await requireSprintProjects(tx, sprint.workspaceId, added);
          if (removed.length) {
            const [inUse] = await tx
              .select({ n: count() })
              .from(tasks)
              .where(and(eq(tasks.sprintId, sprint.id), inArray(tasks.projectId, removed)));
            if (inUse && inUse.n > 0) {
              throw httpError(
                409,
                'SPRINT_PROJECT_IN_USE',
                'Move the tasks of that project out of the sprint first',
              );
            }
            await tx
              .delete(sprintProjects)
              .where(
                and(
                  eq(sprintProjects.sprintId, sprint.id),
                  notInArray(sprintProjects.projectId, projectIds),
                ),
              );
          }
          if (added.length) {
            await tx
              .insert(sprintProjects)
              .values(added.map((projectId) => ({ sprintId: sprint.id, projectId })));
          }
        }
        if (Object.keys(fields).length === 0) return row;
        const [next] = await tx
          .update(sprints)
          .set(fields)
          .where(eq(sprints.id, sprint.id))
          .returning();
        return next ?? row;
      });
      broadcastSprintsChanged(app, request, sprint.workspaceId);
      return sprintDto(app.db, updated);
    },
  );

  app.delete(
    '/sprints/:sprintId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Sprints'],
        summary: 'Delete a sprint',
        description:
          'Admins, owner and the member who created it (else 403). Only a sprint no task has ever ' +
          'been in (409 `SPRINT_IN_USE`), so reports and history stay intact.',
        params: sprintParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { sprint, role } = await loadSprintAccess(request, request.params.sprintId);
      const { user } = requireAuth(request);
      if (!canManageSprint(role, sprint.createdBy, user.id)) {
        throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this');
      }
      await app.db.transaction(async (tx) => {
        await tx
          .select({ id: sprints.id })
          .from(sprints)
          .where(eq(sprints.id, sprint.id))
          .for('update');
        const [used] = await tx
          .select({ n: count() })
          .from(sprintMemberships)
          .where(eq(sprintMemberships.sprintId, sprint.id));
        const [held] = await tx
          .select({ n: count() })
          .from(tasks)
          .where(eq(tasks.sprintId, sprint.id));
        if ((used?.n ?? 0) > 0 || (held?.n ?? 0) > 0) {
          throw httpError(409, 'SPRINT_IN_USE', 'Tasks have been in this sprint');
        }
        await tx.delete(sprints).where(eq(sprints.id, sprint.id));
      });
      broadcastSprintsChanged(app, request, sprint.workspaceId);
      return reply.code(204).send(null);
    },
  );
  done();
};
