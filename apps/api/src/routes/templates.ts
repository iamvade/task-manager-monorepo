import { apiErrorSchema, applyTemplateResponseSchema, applyTemplateSchema } from '@kite/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadProjectAccess } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { applyTemplate } from '../projects/apply-template.js';

const err = apiErrorSchema;

/** Powers the template cards on the empty-project screen. */
export const templateRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.post(
    '/projects/:projectId/from-template',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Templates'],
        summary: 'Fill a project from a template',
        description:
          "`product-launch` (18 tasks), `sprint-planning` (12 tasks in a new two-week sprint starting today) or `bug-triage` (6 tasks with S1–S4 severity tags). Only for a project without tasks (409 `PROJECT_NOT_EMPTY`). Titles use the caller's language; due dates count from today in their time zone.",
        params: z.object({ projectId: z.uuid() }),
        body: applyTemplateSchema,
        response: { 201: applyTemplateResponseSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { project } = await loadProjectAccess(request, request.params.projectId);
      const { user } = requireAuth(request);
      const result = await applyTemplate(app, project.id, request.body.templateId, user);
      return reply.code(201).send(result);
    },
  );
  done();
};
