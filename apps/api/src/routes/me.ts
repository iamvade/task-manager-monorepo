import { apiErrorSchema, initialsFor, meResponseSchema, updateMeSchema } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { buildMe } from '../auth/me.js';
import { requireAuth } from '../auth/plugin.js';
import { users } from '../db/schema/index.js';

export const meRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.patch(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        body: updateMeSchema,
        response: { 200: meResponseSchema, 400: apiErrorSchema, 401: apiErrorSchema },
      },
    },
    async (request) => {
      const { user } = requireAuth(request);
      const changes = request.body;
      const [updated] = await app.db
        .update(users)
        .set({ ...changes, ...(changes.name ? { initials: initialsFor(changes.name) } : {}) })
        .where(eq(users.id, user.id))
        .returning();
      return buildMe(app.db, updated ?? user);
    },
  );
  done();
};
