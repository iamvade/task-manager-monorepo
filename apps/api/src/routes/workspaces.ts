import {
  apiErrorSchema,
  projectKeySuggestionQuerySchema,
  projectKeySuggestionSchema,
  sidebarResponseSchema,
  updateMemberRoleSchema,
  workspaceMemberSchema,
  type SidebarProject,
} from '@kite/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import {
  favorites,
  notifications,
  projects,
  spaces,
  statuses,
  taskAssignees,
  tasks,
  workspaceMembers,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { pickProjectKey } from '../projects/keys.js';
import { listMembers } from '../projects/members.js';

const err = apiErrorSchema;
const params = z.object({ workspaceId: z.uuid() });

const toSidebarProject = (p: typeof projects.$inferSelect): SidebarProject => ({
  id: p.id,
  spaceId: p.spaceId,
  name: p.name,
  key: p.key,
  color: p.color,
  position: p.position,
  createdAt: p.createdAt.toISOString(),
});

export const workspaceRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/sidebar',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Sidebar',
        description:
          'Spaces with their non-archived projects (by position), favorites, open tasks assigned to me and unread inbox count, in one request.',
        params,
        response: { 200: sidebarResponseSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { user } = requireAuth(request);
      const db = app.db;

      const [spaceRows, projectRows, favoriteRows, [myTasks], [inbox]] = await Promise.all([
        db
          .select()
          .from(spaces)
          .where(eq(spaces.workspaceId, workspaceId))
          .orderBy(asc(spaces.position)),
        db
          .select()
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
          .orderBy(asc(projects.position)),
        db
          .select({ projectId: favorites.projectId })
          .from(favorites)
          .where(eq(favorites.userId, user.id)),
        db
          .select({ n: count() })
          .from(taskAssignees)
          .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .innerJoin(statuses, eq(statuses.id, tasks.statusId))
          .where(
            and(
              eq(taskAssignees.userId, user.id),
              eq(projects.workspaceId, workspaceId),
              isNull(projects.archivedAt),
              isNull(tasks.deletedAt),
              ne(statuses.category, 'done'),
            ),
          ),
        db
          .select({ n: count() })
          .from(notifications)
          .innerJoin(tasks, eq(tasks.id, notifications.taskId))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(
            and(
              eq(notifications.userId, user.id),
              eq(projects.workspaceId, workspaceId),
              isNull(notifications.readAt),
              isNull(notifications.archivedAt),
              isNull(tasks.deletedAt),
            ),
          ),
      ]);

      const favoriteIds = new Set(favoriteRows.map((f) => f.projectId));
      return {
        spaces: spaceRows.map((s) => ({
          id: s.id,
          name: s.name,
          initial: s.initial,
          color: s.color,
          position: s.position,
          projects: projectRows.filter((p) => p.spaceId === s.id).map(toSidebarProject),
        })),
        favorites: projectRows
          .filter((p) => favoriteIds.has(p.id))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(toSidebarProject),
        myTasksCount: myTasks?.n ?? 0,
        inboxUnreadCount: inbox?.n ?? 0,
      };
    },
  );

  app.get(
    '/workspaces/:workspaceId/members',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'List workspace members',
        params,
        response: { 200: z.array(workspaceMemberSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      await requireWorkspaceMember(request, request.params.workspaceId);
      return listMembers(app.db, request.params.workspaceId);
    },
  );

  app.patch(
    '/workspaces/:workspaceId/members/:userId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Change a member’s role',
        description:
          'Admin or owner. Switches another member between `admin` and `member`. 409 `OWNER_ROLE` for the owner (ownership can’t change here) and 409 `OWN_ROLE` for your own membership.',
        params: params.extend({ userId: z.uuid() }),
        body: updateMemberRoleSchema,
        response: { 200: workspaceMemberSchema, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { workspaceId, userId } = request.params;
      const caller = await requireWorkspaceMember(request, workspaceId, 'admin');
      const [target] = await app.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        )
        .limit(1);
      if (!target) throw httpError(404, 'NOT_FOUND', 'Member not found');
      if (userId === caller.userId) {
        throw httpError(409, 'OWN_ROLE', 'You can’t change your own role');
      }
      if (target.role === 'owner') {
        throw httpError(409, 'OWNER_ROLE', 'The owner’s role can’t be changed');
      }
      await app.db
        .update(workspaceMembers)
        .set({ role: request.body.role })
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        );
      const [member] = await listMembers(app.db, workspaceId, { userId });
      if (!member) throw httpError(404, 'NOT_FOUND', 'Member not found');
      return member;
    },
  );

  app.get(
    '/workspaces/:workspaceId/project-key-suggestion',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Suggest a project key',
        description:
          'A 2–4 letter key derived from the name (Mongolian is transliterated), unique in the workspace.',
        params,
        querystring: projectKeySuggestionQuerySchema,
        response: { 200: projectKeySuggestionSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      await requireWorkspaceMember(request, request.params.workspaceId);
      return { key: await pickProjectKey(app.db, request.params.workspaceId, request.query.name) };
    },
  );
  done();
};
