import {
  activityPageQuerySchema,
  activityPageSchema,
  apiErrorSchema,
  homeQuerySchema,
  homeSchema,
} from '@kite/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { listMyActivity } from '../home/activity.js';
import { buildHome } from '../home/build.js';

const err = apiErrorSchema;

export const homeRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/me/home',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['My Tasks'],
        summary: 'My Tasks home',
        description:
          'My tasks in one workspace grouped Overdue / Today / This Week (tomorrow–Sunday) / Later (then no due date), with stats, completions per day Mon–Sun and the first page of recent activity on tasks I am assigned to or follow. "Today" and the week are in my time zone.',
        querystring: homeQuerySchema,
        response: { 200: homeSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireAuth(request);
      const { workspaceId } = request.query;
      await requireWorkspaceMember(request, workspaceId);
      return buildHome(app.db, request.log, user, workspaceId, app.clock());
    },
  );

  app.get(
    '/me/activity',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['My Tasks'],
        summary: 'Older recent activity',
        description:
          'Next pages of the My Tasks activity feed: pass `activity.nextCursor` from `/me/home` (or from a previous page) as `cursor`. 400 `INVALID_CURSOR` for a malformed cursor.',
        querystring: activityPageQuerySchema,
        response: { 200: activityPageSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireAuth(request);
      await requireWorkspaceMember(request, request.query.workspaceId);
      return listMyActivity(app.db, request.log, user.id, request.query);
    },
  );

  done();
};
