import {
  apiErrorSchema,
  deactivateMemberSchema,
  memberHandoverSchema,
  workspaceMemberSchema,
  type MemberHandover,
} from '@kite/shared';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { activeMember } from '../auth/membership.js';
import type { DbOrTx } from '../db/client.js';
import {
  projects,
  statuses,
  taskAssignees,
  taskFollowers,
  tasks,
  workspaceMembers,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { listMembers } from '../projects/members.js';
import { revalidate } from '../realtime/plugin.js';
import { handOverFacilitator } from '../standups/groups.js';
import { mutateTasks } from '../tasks/mutation.js';
import { applyTaskPatch, setTaskAssignees } from '../tasks/patch.js';
import { requireMembers } from '../tasks/refs.js';
import { openStatusSql } from '../tasks/status.js';

const err = apiErrorSchema;
const params = z.object({ workspaceId: z.uuid(), userId: z.uuid() });

/** Open (not done, not deleted) tasks of the workspace's non-archived projects. */
const openTasksOf = (workspaceId: string) =>
  and(
    eq(projects.workspaceId, workspaceId),
    isNull(projects.archivedAt),
    isNull(tasks.deletedAt),
    openStatusSql(),
  );

/** Tasks a leaver hands over, by project: assigned to them, or they review. */
async function handoverTasks(db: DbOrTx, workspaceId: string, userId: string) {
  const [assigned, reviewing] = await Promise.all([
    db
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(and(openTasksOf(workspaceId), eq(taskAssignees.userId, userId))),
    db
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(and(openTasksOf(workspaceId), eq(tasks.reviewerId, userId))),
  ]);
  return { assigned, reviewing };
}

/** The member's active row; 404 when missing (or already deactivated, unless `deactivated`). */
async function requireTarget(db: DbOrTx, workspaceId: string, userId: string, deactivated = false) {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        deactivated ? isNotNull(workspaceMembers.deactivatedAt) : activeMember,
      ),
    )
    .limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Member not found');
  return row;
}

export const offboardingRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/members/:userId/handover',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'What a member would hand over',
        description:
          'Admin or owner. Open tasks assigned to the member, open tasks they review and non-archived projects they lead (the deactivate dialog).',
        params,
        response: { 200: memberHandoverSchema, 401: err, 403: err, 404: err },
      },
    },
    async (request): Promise<MemberHandover> => {
      const { workspaceId, userId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      await requireTarget(app.db, workspaceId, userId);
      const [{ assigned, reviewing }, leadOf] = await Promise.all([
        handoverTasks(app.db, workspaceId, userId),
        app.db
          .select({ id: projects.id, key: projects.key, name: projects.name })
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              eq(projects.leadId, userId),
              isNull(projects.archivedAt),
            ),
          )
          .orderBy(asc(projects.name)),
      ]);
      return { openTasks: assigned.length, reviewing: reviewing.length, leadOf };
    },
  );

  app.post(
    '/workspaces/:workspaceId/members/:userId/deactivate',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Deactivate a member (offboarding)',
        description:
          'Admin or owner. With `reassignTo` (an active member) the leaver is replaced by that person on their open tasks (as assignee and reviewer) and as project lead and standup facilitator (joining those groups), with the usual activity rows; without it they are just removed from those. Then the membership is deactivated: no access to the workspace (404 everywhere, their sockets close), hidden from pickers, @mentions and Workload, their follows dropped; their history stays. 409 `DEACTIVATE_OWNER` for the owner, `DEACTIVATE_SELF` for yourself; 400 `INVALID_REFERENCE` for a bad `reassignTo`.',
        params,
        body: deactivateMemberSchema,
        response: {
          200: workspaceMemberSchema,
          400: err,
          401: err,
          403: err,
          404: err,
          409: err,
        },
      },
    },
    async (request) => {
      const { workspaceId, userId } = request.params;
      const caller = await requireWorkspaceMember(request, workspaceId, 'admin');
      const target = await requireTarget(app.db, workspaceId, userId);
      if (target.role === 'owner') {
        throw httpError(409, 'DEACTIVATE_OWNER', 'The owner can’t be deactivated');
      }
      if (userId === caller.userId) {
        throw httpError(409, 'DEACTIVATE_SELF', 'You can’t deactivate yourself');
      }
      const reassignTo = request.body.reassignTo ?? null;
      if (reassignTo === userId) {
        throw httpError(400, 'INVALID_REFERENCE', 'Hand the work to someone else');
      }
      if (reassignTo) await requireMembers(app.db, workspaceId, [reassignTo], 'Reassign to');

      // Hand over open work, one transaction per project (activity rows + events as usual).
      const { assigned, reviewing } = await handoverTasks(app.db, workspaceId, userId);
      const byProject = new Map<string, { assigned: string[]; reviewing: string[] }>();
      for (const [list, kind] of [
        [assigned, 'assigned'],
        [reviewing, 'reviewing'],
      ] as const) {
        for (const t of list) {
          const entry = byProject.get(t.projectId) ?? { assigned: [], reviewing: [] };
          entry[kind].push(t.id);
          byProject.set(t.projectId, entry);
        }
      }
      for (const [projectId, work] of byProject) {
        await mutateTasks(app, { projectId, actorId: caller.userId }, async (m) => {
          for (const taskId of work.assigned) {
            const task = await m.lockTask(taskId);
            const current = await m.tx
              .select({ userId: taskAssignees.userId })
              .from(taskAssignees)
              .where(eq(taskAssignees.taskId, task.id));
            const next = current.map((a) => a.userId).filter((id) => id !== userId);
            if (reassignTo && !next.includes(reassignTo)) next.push(reassignTo);
            await setTaskAssignees(m, task, next);
          }
          for (const taskId of work.reviewing) {
            await applyTaskPatch(m, await m.lockTask(taskId), { reviewerId: reassignTo });
          }
        });
      }

      await app.db.transaction(async (tx) => {
        await tx
          .update(projects)
          .set({ leadId: reassignTo })
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.leadId, userId)));
        await handOverFacilitator(tx, workspaceId, userId, reassignTo, app.clock());
        await tx
          .delete(taskFollowers)
          .where(
            and(
              eq(taskFollowers.userId, userId),
              inArray(
                taskFollowers.taskId,
                tx
                  .select({ id: tasks.id })
                  .from(tasks)
                  .innerJoin(projects, eq(projects.id, tasks.projectId))
                  .where(eq(projects.workspaceId, workspaceId)),
              ),
            ),
          );
        await tx
          .update(workspaceMembers)
          .set({ deactivatedAt: app.clock(), deactivatedBy: caller.userId })
          .where(
            and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
          );
      });

      app.reportCache.invalidate(workspaceId);
      // Their open sockets for this workspace close now rather than at the next sweep.
      void revalidate(app).catch((e: unknown) => {
        request.log.warn({ err: e }, 'realtime revalidate after deactivation failed');
      });
      const [member] = await listMembers(app.db, workspaceId, { userId, includeDeactivated: true });
      if (!member) throw httpError(404, 'NOT_FOUND', 'Member not found');
      return member;
    },
  );

  app.post(
    '/workspaces/:workspaceId/members/:userId/reactivate',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Reactivate a deactivated member',
        description:
          'Admin or owner. Gives the person their access back with the same role; work handed over stays where it went. 404 unless the member is deactivated.',
        params,
        response: { 200: workspaceMemberSchema, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId, userId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      await requireTarget(app.db, workspaceId, userId, true);
      await app.db
        .update(workspaceMembers)
        .set({ deactivatedAt: null, deactivatedBy: null })
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        );
      app.reportCache.invalidate(workspaceId);
      const [member] = await listMembers(app.db, workspaceId, { userId });
      if (!member) throw httpError(404, 'NOT_FOUND', 'Member not found');
      return member;
    },
  );
  done();
};
