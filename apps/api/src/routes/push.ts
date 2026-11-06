import {
  apiErrorSchema,
  pushConfigSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from '@kite/shared';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/plugin.js';
import { pushSubscriptions } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { isPushServiceEndpoint } from '../push/endpoint.js';

const err = apiErrorSchema;

/** Browsers one person can have subscribed; subscribing past it drops the least recently used. */
export const MAX_PUSH_SUBSCRIPTIONS = 20;

export const pushRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/push/config',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'Web Push availability and VAPID key',
        description:
          '`enabled: false` when the server has no VAPID keys (then the web hides the push switch).',
        response: { 200: pushConfigSchema, 401: err },
      },
    },
    () => Promise.resolve({ enabled: app.push.enabled, publicKey: app.push.publicKey }),
  );

  app.put(
    '/me/push-subscriptions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: "Subscribe this browser to my notifications' pushes",
        description:
          'Saves `PushSubscription.toJSON()`, tied to the current session: signing out (or a password reset) removes it. The same endpoint again moves it to this session and user. The endpoint must be on a known push service (FCM, Mozilla, Apple, Windows), else 400 `INVALID_PUSH_ENDPOINT`; 409 `PUSH_DISABLED` when the server has no VAPID keys. Keeps my newest 20.',
        body: pushSubscriptionSchema,
        response: { 204: z.null(), 400: err, 401: err, 409: err },
      },
    },
    async (request, reply) => {
      const { user, sessionId } = requireAuth(request);
      if (!app.push.enabled) throw httpError(409, 'PUSH_DISABLED', 'Push is not set up');
      const { endpoint, keys } = request.body;
      if (!isPushServiceEndpoint(endpoint)) {
        throw httpError(400, 'INVALID_PUSH_ENDPOINT', 'Not a known push service');
      }
      const now = app.clock();
      await app.db.transaction(async (tx) => {
        await tx
          .insert(pushSubscriptions)
          .values({
            userId: user.id,
            sessionId,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            lastUsedAt: now,
          })
          .onConflictDoUpdate({
            target: pushSubscriptions.endpoint,
            set: {
              userId: user.id,
              sessionId,
              p256dh: keys.p256dh,
              auth: keys.auth,
              lastUsedAt: now,
            },
          });
        const keep = tx
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, user.id))
          .orderBy(desc(pushSubscriptions.lastUsedAt), desc(pushSubscriptions.id))
          .limit(MAX_PUSH_SUBSCRIPTIONS);
        await tx
          .delete(pushSubscriptions)
          .where(
            and(eq(pushSubscriptions.userId, user.id), notInArray(pushSubscriptions.id, keep)),
          );
      });
      return reply.code(204).send(null);
    },
  );

  app.delete(
    '/me/push-subscriptions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Inbox'],
        summary: 'Stop pushes to this browser',
        description:
          'Removes my subscription with this endpoint (nothing happens if there is none).',
        body: pushUnsubscribeSchema,
        response: { 204: z.null(), 400: err, 401: err },
      },
    },
    async (request, reply) => {
      const { user } = requireAuth(request);
      await app.db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            eq(pushSubscriptions.endpoint, request.body.endpoint),
          ),
        );
      return reply.code(204).send(null);
    },
  );

  done();
};
