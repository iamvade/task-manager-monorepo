import {
  apiErrorSchema,
  createFeedbackTopicSchema,
  feedbackTopicKey,
  feedbackTopicSchema,
  feedbackTopicWithCountSchema,
  updateFeedbackTopicSchema,
} from '@kite/shared';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { isUniqueViolation } from '../db/errors.js';
import { one } from '../db/rows.js';
import { feedback, feedbackTopics } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { broadcastFeedbackChanged } from '../feedback/link.js';
import { toTopic } from '../feedback/query.js';
import { clientIdOf } from '../realtime/client-id.js';

const err = apiErrorSchema;
const topicParams = z.object({ feedbackTopicId: z.uuid() });

/** Unique violations become 409 `TOPIC_EXISTS` (name, case-insensitive) / `TOPIC_KEY_EXISTS`. */
async function unique<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e, 'feedback_topics_workspace_id_lower_name_unique')) {
      throw httpError(409, 'TOPIC_EXISTS', 'A topic with this name already exists');
    }
    if (isUniqueViolation(e, 'feedback_topics_workspace_id_key_unique')) {
      throw httpError(409, 'TOPIC_KEY_EXISTS', 'Another topic already uses this link key');
    }
    throw e;
  }
}

/**
 * Feedback topics: a workspace's own list, managed from the inbox. Every member reads them (the
 * filter, the panel's picker, the per-topic links); admins and owners change them. A topic of
 * another workspace answers 404 like everything outside it.
 */
export const feedbackTopicRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** A topic and the caller's role in its workspace (404 outside it, 403 below `minRole`). */
  async function loadTopic(request: FastifyRequest, topicId: string, minRole: 'member' | 'admin') {
    requireAuth(request);
    const [topic] = await app.db
      .select()
      .from(feedbackTopics)
      .where(eq(feedbackTopics.id, topicId))
      .limit(1);
    if (!topic) throw httpError(404, 'NOT_FOUND', 'Topic not found');
    await requireWorkspaceMember(request, topic.workspaceId, minRole);
    return topic;
  }

  /**
   * A name clash is reported before a key clash (a key made from a taken name clashes too); the
   * unique indexes still catch a race.
   */
  async function requireFreeName(workspaceId: string, name: string, exceptId?: string) {
    const [taken] = await app.db
      .select({ id: feedbackTopics.id })
      .from(feedbackTopics)
      .where(
        and(
          eq(feedbackTopics.workspaceId, workspaceId),
          sql`lower(${feedbackTopics.name}) = lower(${name})`,
          exceptId ? ne(feedbackTopics.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (taken) throw httpError(409, 'TOPIC_EXISTS', 'A topic with this name already exists');
  }

  /** The inbox, the panels and the topics dialog of the workspace's tabs refetch. */
  function broadcast(request: FastifyRequest, workspaceId: string) {
    broadcastFeedbackChanged(app, {
      workspaceId,
      actorId: requireAuth(request).user.id,
      clientId: clientIdOf(request),
    });
  }

  app.get(
    '/workspaces/:workspaceId/feedback-topics',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'List feedback topics',
        description: 'By name, each with the number of feedback items carrying it.',
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(feedbackTopicWithCountSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const used = app.db
        .select({ topicId: feedback.topicId, n: count().as('n') })
        .from(feedback)
        .where(eq(feedback.workspaceId, workspaceId))
        .groupBy(feedback.topicId)
        .as('used');
      const rows = await app.db
        .select({
          topic: feedbackTopics,
          feedbackCount: sql<number>`coalesce(${used.n}, 0)`.mapWith(Number),
        })
        .from(feedbackTopics)
        .leftJoin(used, eq(used.topicId, feedbackTopics.id))
        .where(eq(feedbackTopics.workspaceId, workspaceId))
        .orderBy(asc(sql`lower(${feedbackTopics.name})`), asc(feedbackTopics.name));
      return rows.map((r) => ({ ...toTopic(r.topic), feedbackCount: r.feedbackCount }));
    },
  );

  app.post(
    '/workspaces/:workspaceId/feedback-topics',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Create a feedback topic',
        description:
          'Admin or owner. `key` (the public link’s `?topic=`) defaults to one made from the name. ' +
          '409 `TOPIC_EXISTS` when the name is taken (case-insensitive), `TOPIC_KEY_EXISTS` when ' +
          'the key is.',
        params: z.object({ workspaceId: z.uuid() }),
        body: createFeedbackTopicSchema,
        response: { 201: feedbackTopicSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      const { user } = requireAuth(request);
      const { name, color } = request.body;
      await requireFreeName(workspaceId, name);
      const key = request.body.key ?? feedbackTopicKey(name);
      const topic = await unique(async () =>
        one(
          await app.db
            .insert(feedbackTopics)
            .values({ workspaceId, name, key, color, createdBy: user.id })
            .returning(),
          'feedback topic',
        ),
      );
      broadcast(request, workspaceId);
      return reply.code(201).send(toTopic(topic));
    },
  );

  app.patch(
    '/feedback-topics/:feedbackTopicId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Rename, recolor or re-key a feedback topic',
        description:
          'Admin or owner. Changing `key` breaks links shared with the old one (they open the ' +
          'form without a topic). 409 `TOPIC_EXISTS` / `TOPIC_KEY_EXISTS`. The activity log ' +
          'keeps the old name.',
        params: topicParams,
        body: updateFeedbackTopicSchema,
        response: { 200: feedbackTopicSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const topic = await loadTopic(request, request.params.feedbackTopicId, 'admin');
      if (request.body.name) await requireFreeName(topic.workspaceId, request.body.name, topic.id);
      const [updated] = await unique(() =>
        app.db
          .update(feedbackTopics)
          .set(request.body)
          .where(eq(feedbackTopics.id, topic.id))
          .returning(),
      );
      broadcast(request, topic.workspaceId);
      return toTopic(updated ?? topic);
    },
  );

  app.delete(
    '/feedback-topics/:feedbackTopicId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Feedback'],
        summary: 'Delete a feedback topic',
        description:
          'Admin or owner. Its feedback items keep no topic; links with its key open the form ' +
          'without one.',
        params: topicParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const topic = await loadTopic(request, request.params.feedbackTopicId, 'admin');
      // feedback.topic_id is set null by the foreign key.
      await app.db.delete(feedbackTopics).where(eq(feedbackTopics.id, topic.id));
      broadcast(request, topic.workspaceId);
      return reply.code(204).send(null);
    },
  );
  done();
};
