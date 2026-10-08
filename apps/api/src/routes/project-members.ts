import { apiErrorSchema, workspaceMemberSchema } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';
import { projectMembers } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { listMembers } from '../projects/members.js';

const err = apiErrorSchema;
const projectParams = z.object({ projectId: z.uuid() });
const memberParams = projectParams.extend({ userId: z.uuid() });

/** The project's team: header avatars, suggested assignees and @mentions. Not an access list. */
export const projectMemberRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/projects/:projectId/members',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Project members'],
        summary: 'List the project team',
        params: projectParams,
        response: { 200: z.array(workspaceMemberSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      return listMembers(app.db, project.workspaceId, { projectId: project.id });
    },
  );

  app.put(
    '/projects/:projectId/members/:userId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Project members'],
        summary: 'Add to the project team',
        description:
          'Idempotent. The user must be a workspace member (404 `USER_NOT_FOUND` otherwise).',
        params: memberParams,
        response: { 200: workspaceMemberSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const [member] = await listMembers(app.db, project.workspaceId, {
        userId: request.params.userId,
      });
      if (!member) throw httpError(404, 'USER_NOT_FOUND', 'No such member in this workspace');
      await app.db
        .insert(projectMembers)
        .values({ projectId: project.id, userId: member.user.id })
        .onConflictDoNothing();
      return member;
    },
  );

  app.delete(
    '/projects/:projectId/members/:userId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Project members'],
        summary: 'Remove from the project team',
        description: 'Idempotent.',
        params: memberParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      await app.db
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, project.id),
            eq(projectMembers.userId, request.params.userId),
          ),
        );
      return reply.code(204).send(null);
    },
  );
  done();
};
