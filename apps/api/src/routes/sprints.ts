import { apiErrorSchema, createSprintSchema, sprintSchema } from '@kite/shared';
import { asc, eq, max } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';
import { one } from '../db/rows.js';
import { projects, sprints } from '../db/schema/index.js';
import { toSprintDto } from '../projects/detail.js';

const err = apiErrorSchema;
const projectParams = z.object({ projectId: z.uuid() });

export const sprintRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/projects/:projectId/sprints',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Sprints'],
        summary: 'List sprints',
        description: 'By start date.',
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
        tags: ['Sprints'],
        summary: 'Create a sprint',
        description:
          'Takes the next number of the project ("Sprint 14"); without a name it shows as "Sprint {number}".',
        params: projectParams,
        body: createSprintSchema,
        response: { 201: sprintSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const sprint = await app.db.transaction(async (tx) => {
        // The project row lock serializes number allocation.
        await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, project.id))
          .for('no key update');
        const [last] = await tx
          .select({ number: max(sprints.number) })
          .from(sprints)
          .where(eq(sprints.projectId, project.id));
        return one(
          await tx
            .insert(sprints)
            .values({ projectId: project.id, number: (last?.number ?? 0) + 1, ...request.body })
            .returning(),
          'sprint',
        );
      });
      app.reportCache.invalidate(project.workspaceId);
      return reply.code(201).send(toSprintDto(sprint));
    },
  );
  done();
};
