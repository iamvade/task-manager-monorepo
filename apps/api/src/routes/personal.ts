import {
  apiErrorSchema,
  createPersonalItemSchema,
  createPersonalTopicSchema,
  moveSchema,
  personalIndexSchema,
  personalItemSchema,
  personalItemSummarySchema,
  personalTopicSchema,
  updatePersonalItemSchema,
  updatePersonalTopicSchema,
} from '@kite/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../db/errors.js';
import { movePosition, positionAfter, positionBefore } from '../db/position.js';
import { one } from '../db/rows.js';
import { personalItems, personalTopics } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import {
  bodyText,
  loadMyItem,
  loadMyTopic,
  personalIndex,
  personalItemDetail,
  publishPersonalChanged,
  requirePersonalOwner,
  requireTopicRef,
  syncPersonalLinks,
  toItemSummary,
  toTopicDto,
} from '../personal/service.js';

const err = apiErrorSchema;
const TAGS = ['Personal'];
const topicParams = z.object({ topicId: z.uuid() });
const itemParams = z.object({ itemId: z.uuid() });
/** Deep equality for JSON values (jsonb doesn't keep key order). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

const OWNER_ONLY = 'Owner only: anyone else (admins and the platform admin included) gets 404.';

async function uniqueTopicName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e, 'personal_topics_user_id_lower_name_unique')) {
      throw httpError(409, 'TOPIC_EXISTS', 'A topic with this name already exists');
    }
    throw e;
  }
}

export const personalRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/me/personal',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'My personal space',
        description:
          'My topics, notes and to-dos (without bodies), the links written in them and the team tasks they link to that I can still see. Private: the same in every workspace, visible to me only.',
        response: { 200: personalIndexSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      return personalIndex(app.db, user.id);
    },
  );

  app.post(
    '/me/personal/topics',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Create a personal topic',
        description: '409 `TOPIC_EXISTS` when I already have one by that name (case-insensitive).',
        body: createPersonalTopicSchema,
        response: { 201: personalTopicSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { user } = requirePersonalOwner(request);
      const [last] = await app.db
        .select({ position: personalTopics.position })
        .from(personalTopics)
        .where(eq(personalTopics.userId, user.id))
        .orderBy(desc(personalTopics.position))
        .limit(1);
      const topic = await uniqueTopicName(async () =>
        one(
          await app.db
            .insert(personalTopics)
            .values({ userId: user.id, ...request.body, position: positionAfter(last?.position) })
            .returning(),
          'topic',
        ),
      );
      publishPersonalChanged(app, request);
      return reply.code(201).send(toTopicDto(topic));
    },
  );

  app.patch(
    '/me/personal/topics/:topicId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Rename or recolor a personal topic',
        description: `${OWNER_ONLY} 409 \`TOPIC_EXISTS\` when the name is taken.`,
        params: topicParams,
        body: updatePersonalTopicSchema,
        response: { 200: personalTopicSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      await loadMyTopic(app.db, user.id, request.params.topicId);
      const topic = await uniqueTopicName(async () =>
        one(
          await app.db
            .update(personalTopics)
            .set(request.body)
            .where(eq(personalTopics.id, request.params.topicId))
            .returning(),
          'topic',
        ),
      );
      publishPersonalChanged(app, request);
      return toTopicDto(topic);
    },
  );

  app.post(
    '/me/personal/topics/:topicId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Reorder a personal topic',
        description: `${OWNER_ONLY} Neighbors after the move; 400 \`INVALID_MOVE\` when they aren't my topics.`,
        params: topicParams,
        body: moveSchema,
        response: { 200: personalTopicSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      const topic = await app.db.transaction(async (tx) => {
        await loadMyTopic(tx, user.id, request.params.topicId);
        const scope = await tx
          .select({ id: personalTopics.id, position: personalTopics.position })
          .from(personalTopics)
          .where(eq(personalTopics.userId, user.id))
          .for('update');
        const position = movePosition(scope, request.params.topicId, request.body);
        return one(
          await tx
            .update(personalTopics)
            .set({ position })
            .where(eq(personalTopics.id, request.params.topicId))
            .returning(),
          'topic',
        );
      });
      publishPersonalChanged(app, request);
      return toTopicDto(topic);
    },
  );

  app.delete(
    '/me/personal/topics/:topicId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Delete a personal topic',
        description: `${OWNER_ONLY} Its notes and to-dos move to "No topic".`,
        params: topicParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requirePersonalOwner(request);
      await loadMyTopic(app.db, user.id, request.params.topicId);
      await app.db.delete(personalTopics).where(eq(personalTopics.id, request.params.topicId));
      publishPersonalChanged(app, request);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/me/personal/items',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Create a note or to-do',
        description:
          "Goes to the top of my list. 400 `INVALID_REFERENCE` for a topic that isn't mine, `INVALID_TASK` when the body links a team task I can't see.",
        body: createPersonalItemSchema,
        response: { 201: personalItemSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requirePersonalOwner(request);
      const { body: doc, ...fields } = request.body;
      const item = await app.db.transaction(async (tx) => {
        await requireTopicRef(tx, user.id, fields.topicId);
        const [first] = await tx
          .select({ position: personalItems.position })
          .from(personalItems)
          .where(eq(personalItems.userId, user.id))
          .orderBy(asc(personalItems.position))
          .limit(1);
        const row = one(
          await tx
            .insert(personalItems)
            .values({
              userId: user.id,
              ...fields,
              body: doc,
              bodyText: bodyText(doc),
              position: positionBefore(first?.position),
              createdAt: app.clock(),
              updatedAt: app.clock(),
            })
            .returning(),
          'item',
        );
        await syncPersonalLinks(tx, user.id, row.id, doc);
        return row;
      });
      publishPersonalChanged(app, request);
      return reply.code(201).send(await personalItemDetail(app.db, user.id, item));
    },
  );

  app.get(
    '/me/personal/items/:itemId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'A note or to-do',
        description: `${OWNER_ONLY} With its body and the notes linking to it.`,
        params: itemParams,
        response: { 200: personalItemSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      const item = await loadMyItem(app.db, user.id, request.params.itemId);
      return personalItemDetail(app.db, user.id, item);
    },
  );

  app.patch(
    '/me/personal/items/:itemId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Edit a note or to-do',
        description: `${OWNER_ONLY} Saving the body rebuilds its links. 400 \`INVALID_REFERENCE\` / \`INVALID_TASK\` as on create. No-op edits change nothing.`,
        params: itemParams,
        body: updatePersonalItemSchema,
        response: { 200: personalItemSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      const { itemId } = request.params;
      const { done, body: doc, ...fields } = request.body;
      const [item, changed] = await app.db.transaction(async (tx) => {
        const current = await loadMyItem(tx, user.id, itemId, { lock: true });
        if (fields.topicId !== undefined) await requireTopicRef(tx, user.id, fields.topicId);
        const set: Partial<typeof personalItems.$inferInsert> = {};
        if (fields.kind !== undefined && fields.kind !== current.kind) set.kind = fields.kind;
        if (fields.title !== undefined && fields.title !== current.title) set.title = fields.title;
        if (fields.topicId !== undefined && fields.topicId !== current.topicId) {
          set.topicId = fields.topicId;
        }
        if (fields.dueDate !== undefined && fields.dueDate !== current.dueDate) {
          set.dueDate = fields.dueDate;
        }
        if (done !== undefined && done !== (current.doneAt !== null)) {
          set.doneAt = done ? app.clock() : null;
        }
        if (doc !== undefined && !sameJson(doc, current.body)) {
          set.body = doc;
          set.bodyText = bodyText(doc);
          await syncPersonalLinks(tx, user.id, itemId, doc);
        }
        if (Object.keys(set).length === 0) return [current, false] as const;
        const row = one(
          await tx
            .update(personalItems)
            .set({ ...set, updatedAt: app.clock() })
            .where(eq(personalItems.id, itemId))
            .returning(),
          'item',
        );
        return [row, true] as const;
      });
      if (changed) publishPersonalChanged(app, request);
      return personalItemDetail(app.db, user.id, item);
    },
  );

  app.post(
    '/me/personal/items/:itemId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Reorder a note or to-do',
        description: `${OWNER_ONLY} Neighbors after the move (my live items); 400 \`INVALID_MOVE\` otherwise.`,
        params: itemParams,
        body: moveSchema,
        response: { 200: personalItemSummarySchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      const item = await app.db.transaction(async (tx) => {
        await loadMyItem(tx, user.id, request.params.itemId);
        const rows = await tx
          .select({
            id: personalItems.id,
            position: personalItems.position,
            deletedAt: personalItems.deletedAt,
          })
          .from(personalItems)
          .where(eq(personalItems.userId, user.id))
          .for('update');
        const scope = rows.map((r) => ({ id: r.id, position: r.position, live: !r.deletedAt }));
        const position = movePosition(scope, request.params.itemId, request.body);
        return one(
          await tx
            .update(personalItems)
            .set({ position })
            .where(eq(personalItems.id, request.params.itemId))
            .returning(),
          'item',
        );
      });
      publishPersonalChanged(app, request);
      return toItemSummary(item);
    },
  );

  app.delete(
    '/me/personal/items/:itemId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Delete a note or to-do',
        description: `${OWNER_ONLY} Soft delete: restorable for 30 days (Undo), then purged. Links to it show as a note not created yet.`,
        params: itemParams,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requirePersonalOwner(request);
      await loadMyItem(app.db, user.id, request.params.itemId);
      await app.db
        .update(personalItems)
        .set({ deletedAt: app.clock() })
        .where(and(eq(personalItems.id, request.params.itemId), isNull(personalItems.deletedAt)));
      publishPersonalChanged(app, request);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/me/personal/items/:itemId/restore',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Restore a deleted note or to-do',
        description: `${OWNER_ONLY} 404 when it isn't deleted (or was purged).`,
        params: itemParams,
        response: { 200: personalItemSchema, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requirePersonalOwner(request);
      await loadMyItem(app.db, user.id, request.params.itemId, { deleted: true });
      const item = one(
        await app.db
          .update(personalItems)
          .set({ deletedAt: null })
          .where(eq(personalItems.id, request.params.itemId))
          .returning(),
        'item',
      );
      publishPersonalChanged(app, request);
      return personalItemDetail(app.db, user.id, item);
    },
  );

  done();
};
