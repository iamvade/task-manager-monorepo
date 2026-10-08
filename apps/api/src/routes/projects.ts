import { apiErrorSchema, projectSummarySchema } from '@kite/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';

export const projectRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/projects/:projectId',
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ projectId: z.uuid() }),
        response: { 200: projectSummarySchema, 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      return {
        id: project.id,
        workspaceId: project.workspaceId,
        spaceId: project.spaceId,
        key: project.key,
        name: project.name,
        color: project.color,
        archivedAt: project.archivedAt?.toISOString() ?? null,
      };
    },
  );
  done();
};
