import { apiErrorSchema, createTagSchema, tagSchema, updateTagSchema } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadTagAccess, requireWorkspaceMember } from '../auth/access.js';
import { isUniqueViolation } from '../db/errors.js';
import { one } from '../db/rows.js';
import { tags } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const err = apiErrorSchema;
const tagParams = z.object({ tagId: z.uuid() });

const toTagDto = (t: typeof tags.$inferSelect) => ({ id: t.id, name: t.name, color: t.color });

/** Unique-name violations become 409 `TAG_EXISTS`. */
async function uniqueName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e, 'tags_workspace_id_name_unique')) {
      throw httpError(409, 'TAG_EXISTS', 'A tag with this name already exists');
    }
    throw e;
  }
}

export const tagRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/tags',
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(tagSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      await requireWorkspaceMember(request, request.params.workspaceId);
      const rows = await app.db
        .select()
        .from(tags)
        .where(eq(tags.workspaceId, request.params.workspaceId))
        .orderBy(asc(tags.name));
      return rows.map(toTagDto);
    },
  );

  app.post(
    '/workspaces/:workspaceId/tags',
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ workspaceId: z.uuid() }),
        body: createTagSchema,
        response: { 201: tagSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const tag = await uniqueName(async () =>
        one(
          await app.db
            .insert(tags)
            .values({ workspaceId, ...request.body })
            .returning(),
          'tag',
        ),
      );
      return reply.code(201).send(toTagDto(tag));
    },
  );

  app.patch(
    '/tags/:tagId',
    {
      preHandler: app.authenticate,
      schema: {
        params: tagParams,
        body: updateTagSchema,
        response: { 200: tagSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { tag } = await loadTagAccess(request, request.params.tagId);
      const [updated] = await uniqueName(() =>
        app.db.update(tags).set(request.body).where(eq(tags.id, tag.id)).returning(),
      );
      return toTagDto(updated ?? tag);
    },
  );

  app.delete(
    '/tags/:tagId',
    {
      preHandler: app.authenticate,
      schema: { params: tagParams, response: { 204: z.null(), 401: err, 403: err, 404: err } },
    },
    async (request, reply) => {
      const { tag } = await loadTagAccess(request, request.params.tagId, 'admin');
      // task_tags rows cascade.
      await app.db.delete(tags).where(eq(tags.id, tag.id));
      return reply.code(204).send(null);
    },
  );
  done();
};
