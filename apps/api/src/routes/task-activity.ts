import { apiErrorSchema, feedItemSchema, feedQuerySchema, taskFollowersSchema } from '@kite/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadTaskAccess } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import type { Db } from '../db/client.js';
import { buildFeed } from '../tasks/feed.js';
import { follow, listFollowers, unfollow } from '../tasks/followers.js';

const err = apiErrorSchema;
const taskParams = z.object({ taskId: z.uuid() });

async function followersOf(db: Db, taskId: string, userId: string) {
  const followers = await listFollowers(db, taskId);
  return { following: followers.some((f) => f.id === userId), followers };
}

export const taskActivityRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/tasks/:taskId/activity',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Activity'],
        summary: 'Activity feed of a task',
        description:
          'History lines (`kind: "history"`, typed `payload` per `type`) and comment threads (`kind: "comment"`, replies nested) merged oldest first: the drawer\'s All / Comments / History tabs (`type=all|comments|history`).',
        params: taskParams,
        querystring: feedQuerySchema,
        response: { 200: z.array(feedItemSchema), 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { task } = await loadTaskAccess(request, request.params.taskId);
      return buildFeed(app.db, task.id, request.query.type, request.log);
    },
  );

  app.post(
    '/tasks/:taskId/follow',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Activity'],
        summary: 'Follow a task',
        description:
          'Idempotent. Followers get notified about comments and status changes. Creators, assignees, commenters and mentioned people follow automatically.',
        params: taskParams,
        response: { 200: taskFollowersSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { task } = await loadTaskAccess(request, request.params.taskId);
      const { user } = requireAuth(request);
      await follow(app.db, task.id, [user.id]);
      return followersOf(app.db, task.id, user.id);
    },
  );

  app.delete(
    '/tasks/:taskId/follow',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Activity'],
        summary: 'Unfollow a task',
        description: 'Idempotent. Being assigned, commenting or a new mention follows again.',
        params: taskParams,
        response: { 200: taskFollowersSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { task } = await loadTaskAccess(request, request.params.taskId);
      const { user } = requireAuth(request);
      await unfollow(app.db, task.id, user.id);
      return followersOf(app.db, task.id, user.id);
    },
  );

  done();
};
