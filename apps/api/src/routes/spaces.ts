import {
  apiErrorSchema,
  createSpaceSchema,
  moveSchema,
  spaceSchema,
  updateSpaceSchema,
} from '@kite/shared';
import { asc, eq, max } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadSpaceAccess, requireWorkspaceMember } from '../auth/access.js';
import { movePosition, positionAfter } from '../db/position.js';
import { one } from '../db/rows.js';
import { projects, spaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const err = apiErrorSchema;
const spaceParams = z.object({ spaceId: z.uuid() });

const toSpaceDto = (s: typeof spaces.$inferSelect) => ({
  id: s.id,
  workspaceId: s.workspaceId,
  name: s.name,
  initial: s.initial,
  color: s.color,
  position: s.position,
});

/** "Product" → "P", "дизайн" → "Д". */
const initialOf = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();

export const spaceRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.post(
    '/workspaces/:workspaceId/spaces',
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ workspaceId: z.uuid() }),
        body: createSpaceSchema,
        response: { 201: spaceSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const { name, color, initial } = request.body;
      const space = await app.db.transaction(async (tx) => {
        const [last] = await tx
          .select({ position: max(spaces.position) })
          .from(spaces)
          .where(eq(spaces.workspaceId, workspaceId));
        const values = {
          workspaceId,
          name,
          color,
          initial: initial ?? initialOf(name),
          position: positionAfter(last?.position),
        };
        return one(await tx.insert(spaces).values(values).returning(), 'space');
      });
      return reply.code(201).send(toSpaceDto(space));
    },
  );

  app.patch(
    '/spaces/:spaceId',
    {
      preHandler: app.authenticate,
      schema: {
        params: spaceParams,
        body: updateSpaceSchema,
        response: { 200: spaceSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { space } = await loadSpaceAccess(request, request.params.spaceId);
      const [updated] = await app.db
        .update(spaces)
        .set(request.body)
        .where(eq(spaces.id, space.id))
        .returning();
      return toSpaceDto(updated ?? space);
    },
  );

  app.post(
    '/spaces/:spaceId/move',
    {
      preHandler: app.authenticate,
      schema: {
        params: spaceParams,
        body: moveSchema,
        response: { 200: spaceSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { space } = await loadSpaceAccess(request, request.params.spaceId);
      const siblings = await app.db
        .select({ id: spaces.id, position: spaces.position })
        .from(spaces)
        .where(eq(spaces.workspaceId, space.workspaceId))
        .orderBy(asc(spaces.position));
      const position = movePosition(siblings, space.id, request.body);
      const [updated] = await app.db
        .update(spaces)
        .set({ position })
        .where(eq(spaces.id, space.id))
        .returning();
      return toSpaceDto(updated ?? space);
    },
  );

  app.delete(
    '/spaces/:spaceId',
    {
      preHandler: app.authenticate,
      schema: {
        params: spaceParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { space } = await loadSpaceAccess(request, request.params.spaceId, 'admin');
      await app.db.transaction(async (tx) => {
        // Lock the space so a project can't be created in it between the check and the delete.
        await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.id, space.id))
          .for('update');
        const [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.spaceId, space.id))
          .limit(1);
        if (project) {
          throw httpError(409, 'SPACE_NOT_EMPTY', 'Move or delete its projects first');
        }
        await tx.delete(spaces).where(eq(spaces.id, space.id));
      });
      return reply.code(204).send(null);
    },
  );
  done();
};
