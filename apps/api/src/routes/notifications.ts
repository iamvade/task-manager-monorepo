import {
  apiErrorSchema,
  notificationListQuerySchema,
  notificationPageSchema,
  readAllNotificationsSchema,
  readAllResultSchema,
} from '@kite/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { notifications } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { listNotifications, liveTasksOf } from '../notifications/list.js';

const err = apiErrorSchema;
const params = z.object({ notificationId: z.uuid() });

export const notificationRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/me/notifications',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'List my notifications',
        description:
          'Newest first, in one workspace. Tabs: `all`, `mentions`, `assigned` (unarchived) and `archived`. Pass `nextCursor` back as `cursor` for the next page; a malformed cursor is 400 `INVALID_CURSOR`. Notifications on tasks in the trash are hidden. `counts` covers the whole inbox, not the tab.',
        querystring: notificationListQuerySchema,
        response: { 200: notificationPageSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireAuth(request);
      await requireWorkspaceMember(request, request.query.workspaceId);
      return listNotifications(app.db, request.log, user.id, request.query);
    },
  );

  app.post(
    '/me/notifications/read-all',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'Mark all my notifications in a workspace as read',
        body: readAllNotificationsSchema,
        response: { 200: readAllResultSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireAuth(request);
      const { workspaceId } = request.body;
      await requireWorkspaceMember(request, workspaceId);
      const rows = await app.db
        .update(notifications)
        .set({ readAt: app.clock() })
        .where(
          and(
            eq(notifications.userId, user.id),
            isNull(notifications.readAt),
            isNull(notifications.archivedAt),
            liveTasksOf(workspaceId),
          ),
        )
        .returning({ id: notifications.id });
      return { updated: rows.length };
    },
  );

  app.post(
    '/me/notifications/:notificationId/read',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'Mark a notification as read',
        description: 'Idempotent: the first read time is kept. 404 for anyone else’s notification.',
        params,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const [row] = await app.db
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, ${app.clock()})` })
        .where(
          and(
            eq(notifications.id, request.params.notificationId),
            eq(notifications.userId, user.id),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) throw httpError(404, 'NOT_FOUND', 'Notification not found');
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/me/notifications/:notificationId/archive',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'Archive a notification',
        description:
          'Moves it to Archived and marks it read. Idempotent. 404 for anyone else’s notification.',
        params,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const now = app.clock();
      const [row] = await app.db
        .update(notifications)
        .set({
          readAt: sql`coalesce(${notifications.readAt}, ${now})`,
          archivedAt: sql`coalesce(${notifications.archivedAt}, ${now})`,
        })
        .where(
          and(
            eq(notifications.id, request.params.notificationId),
            eq(notifications.userId, user.id),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) throw httpError(404, 'NOT_FOUND', 'Notification not found');
      return reply.code(204).send(null);
    },
  );

  done();
};
