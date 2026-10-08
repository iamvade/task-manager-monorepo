import { apiErrorSchema, createSprintSchema, sprintSchema } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';
import { one } from '../db/rows.js';
import { sprints } from '../db/schema/index.js';
import { toSprintDto } from '../projects/detail.js';

const err = apiErrorSchema;
const projectParams = z.object({ projectId: z.uuid() });

export const sprintRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/projects/:projectId/sprints',
    {
      preHandler: app.authenticate,
      schema: {
        params: projectParams,
        response: { 200: z.array(sprintSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const rows = await app.db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, project.id))
        .orderBy(asc(sprints.startDate), asc(sprints.id));
      return rows.map(toSprintDto);
    },
  );

  app.post(
    '/projects/:projectId/sprints',
    {
      preHandler: app.authenticate,
      schema: {
        params: projectParams,
        body: createSprintSchema,
        response: { 201: sprintSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const sprint = one(
        await app.db
          .insert(sprints)
          .values({ projectId: project.id, ...request.body })
          .returning(),
        'sprint',
      );
      return reply.code(201).send(toSprintDto(sprint));
    },
  );
  done();
};
