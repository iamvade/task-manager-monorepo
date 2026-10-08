import { apiErrorSchema, statusSchema } from '@kite/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';
import { listStatuses, toStatusDto } from '../projects/statuses.js';

export const statusRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/projects/:projectId/statuses',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Statuses'],
        summary: 'List statuses',
        description:
          'By position. `name: null` means a default status (the UI translates it by category).',
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.array(statusSchema), 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      return (await listStatuses(app.db, project.id)).map(toStatusDto);
    },
  );
  done();
};
