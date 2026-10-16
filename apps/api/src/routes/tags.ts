import {
  apiErrorSchema,
  createTagSchema,
  mergeTagSchema,
  tagSchema,
  tagWithUsageSchema,
  updateTagSchema,
} from '@kite/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadTagAccess, requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { isUniqueViolation } from '../db/errors.js';
import { one } from '../db/rows.js';
import { tags, taskTags, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';

const err = apiErrorSchema;
const tagParams = z.object({ tagId: z.uuid() });

const toTagDto = (t: typeof tags.$inferSelect) => ({ id: t.id, name: t.name, color: t.color });

/** Unique-name violations (case-insensitive) become 409 `TAG_EXISTS`. */
async function uniqueName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e, 'tags_workspace_id_lower_name_unique')) {
      throw httpError(409, 'TAG_EXISTS', 'A tag with this name already exists');
    }
    throw e;
  }
}

/** Live (not deleted) tasks carrying the tag. */
async function taskCountOf(app: FastifyInstance, tagId: string): Promise<number> {
  const [row] = await app.db
    .select({ n: count() })
    .from(taskTags)
    .innerJoin(tasks, eq(tasks.id, taskTags.taskId))
    .where(and(eq(taskTags.tagId, tagId), isNull(tasks.deletedAt)));
  return row?.n ?? 0;
}

/** Tells the workspace's other tabs to refetch tags (and the tasks that show them). */
function broadcastTagsChanged(app: FastifyInstance, request: FastifyRequest, workspaceId: string) {
  const { user } = requireAuth(request);
  app.realtime.broadcaster.publish({
    to: { workspaceId },
    exceptClientId: clientIdOf(request),
    message: {
      type: 'tags.changed',
      workspaceId,
      actorId: user.id,
      at: new Date().toISOString(),
    },
  });
}

export const tagRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/workspaces/:workspaceId/tags',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tags'],
        summary: 'List tags',
        description: 'By name, each with the number of live tasks carrying it.',
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(tagWithUsageSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      await requireWorkspaceMember(request, request.params.workspaceId);
      const used = app.db
        .select({ tagId: taskTags.tagId, n: count().as('n') })
        .from(taskTags)
        .innerJoin(tasks, eq(tasks.id, taskTags.taskId))
        .where(isNull(tasks.deletedAt))
        .groupBy(taskTags.tagId)
        .as('used');
      const rows = await app.db
        .select({ tag: tags, taskCount: sql<number>`coalesce(${used.n}, 0)`.mapWith(Number) })
        .from(tags)
        .leftJoin(used, eq(used.tagId, tags.id))
        .where(eq(tags.workspaceId, request.params.workspaceId))
        .orderBy(asc(sql`lower(${tags.name})`), asc(tags.name));
      return rows.map((r) => ({ ...toTagDto(r.tag), taskCount: r.taskCount }));
    },
  );

  app.post(
    '/workspaces/:workspaceId/tags',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tags'],
        summary: 'Create a tag',
        description: 'Admin or owner. 409 `TAG_EXISTS` when the name is taken (case-insensitive).',
        params: z.object({ workspaceId: z.uuid() }),
        body: createTagSchema,
        response: { 201: tagSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      const tag = await uniqueName(async () =>
        one(
          await app.db
            .insert(tags)
            .values({ workspaceId, ...request.body })
            .returning(),
          'tag',
        ),
      );
      broadcastTagsChanged(app, request, workspaceId);
      return reply.code(201).send(toTagDto(tag));
    },
  );

  app.patch(
    '/tags/:tagId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tags'],
        summary: 'Rename or recolor a tag',
        description:
          'Admin or owner. 409 `TAG_EXISTS` when the name is taken (case-insensitive). ' +
          'Task history keeps the old name and color.',
        params: tagParams,
        body: updateTagSchema,
        response: { 200: tagSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { tag } = await loadTagAccess(request, request.params.tagId, 'admin');
      const [updated] = await uniqueName(() =>
        app.db.update(tags).set(request.body).where(eq(tags.id, tag.id)).returning(),
      );
      broadcastTagsChanged(app, request, tag.workspaceId);
      return toTagDto(updated ?? tag);
    },
  );

  app.post(
    '/tags/:tagId/merge',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tags'],
        summary: 'Merge a tag into another',
        description:
          'Admin or owner. Every task carrying this tag gets `intoTagId` instead, then this tag is ' +
          'deleted (one transaction). 400 `INVALID_REFERENCE` when merging into itself or into a ' +
          'tag of another workspace. Returns the remaining tag with its new count.',
        params: tagParams,
        body: mergeTagSchema,
        response: { 200: tagWithUsageSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { tag } = await loadTagAccess(request, request.params.tagId, 'admin');
      const { intoTagId } = request.body;
      const [into] = await app.db.select().from(tags).where(eq(tags.id, intoTagId)).limit(1);
      if (!into || into.id === tag.id || into.workspaceId !== tag.workspaceId) {
        throw httpError(400, 'INVALID_REFERENCE', 'Pick another tag of this workspace');
      }
      await app.db.transaction(async (tx) => {
        const carrying = tx
          .select({ taskId: taskTags.taskId, tagId: sql`${into.id}::uuid`.as('tag_id') })
          .from(taskTags)
          .where(eq(taskTags.tagId, tag.id));
        await tx.insert(taskTags).select(carrying).onConflictDoNothing();
        // The source's task_tags rows cascade.
        await tx.delete(tags).where(eq(tags.id, tag.id));
      });
      broadcastTagsChanged(app, request, tag.workspaceId);
      return { ...toTagDto(into), taskCount: await taskCountOf(app, into.id) };
    },
  );

  app.delete(
    '/tags/:tagId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Tags'],
        summary: 'Delete a tag',
        description: 'Admin or owner. Removes it from every task.',
        params: tagParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const { tag } = await loadTagAccess(request, request.params.tagId, 'admin');
      // task_tags rows cascade.
      await app.db.delete(tags).where(eq(tags.id, tag.id));
      broadcastTagsChanged(app, request, tag.workspaceId);
      return reply.code(204).send(null);
    },
  );
  done();
};
