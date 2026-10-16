import {
  apiErrorSchema,
  createStandupReplySchema,
  groupToday,
  saveStandupEntrySchema,
  standupBlockerSchema,
  standupDateParamSchema,
  standupDaySchema,
  standupEntrySchema,
  standupReactionSchema,
  standupReactionSummarySchema,
  standupReplySchema,
  standupSuggestionsQuerySchema,
  standupSuggestionsSchema,
  updateStandupReplySchema,
  type NotificationType,
} from '@kite/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  loadStandupBlockerAccess,
  loadStandupEntryAccess,
  loadStandupGroupAccess,
  loadStandupReplyAccess,
} from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { one } from '../db/rows.js';
import {
  standupBlockers,
  standupGroups,
  standupReactions,
  standupReplies,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { notifyStandup } from '../notifications/standup.js';
import { clientIdOf } from '../realtime/client-id.js';
import { buildStandupDay, resolveDate } from '../standups/day.js';
import { saveEntry } from '../standups/entry.js';
import { lockGroup } from '../standups/groups.js';
import { publishBlockedChanged, publishStandup } from '../standups/realtime.js';
import { activeGroupMemberIds } from '../standups/schedule.js';
import { buildSuggestions } from '../standups/suggestions.js';
import {
  blockerViews,
  canResolveBlocker,
  entryViews,
  reactionSummary,
  replyDto,
} from '../standups/views.js';

const err = apiErrorSchema;
const groupParams = z.object({ groupId: z.uuid() });
const dayParams = groupParams.extend({ date: standupDateParamSchema });
const blockerParams = z.object({ blockerId: z.uuid() });
const entryParams = z.object({ entryId: z.uuid() });
const reactionParams = entryParams.extend({ emoji: standupReactionSchema });
const replyParams = z.object({ replyId: z.uuid() });

const MEMBERS_ONLY =
  'Standup content is for the group’s members only: other workspace members (admins included) get 403, people outside the workspace 404.';

type GroupRow = typeof standupGroups.$inferSelect;

/** 409 for changes in an archived group (it can still be read). */
function assertActive(group: GroupRow) {
  if (group.archivedAt) throw httpError(409, 'GROUP_ARCHIVED', 'This standup group is archived');
}

/** 409 unless the update is posted (drafts take no reactions or replies). */
function assertPosted(entry: { status: string }) {
  if (entry.status !== 'posted') {
    throw httpError(409, 'NOT_POSTED', 'This update hasn’t been posted yet');
  }
}

export const standupEntryRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const viewerOf = (
    request: FastifyRequest,
    role: Parameters<typeof canResolveBlocker>[3]['role'],
  ) => ({
    userId: requireAuth(request).user.id,
    role,
  });

  app.get(
    '/standup-groups/:groupId/days/:date',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Get a standup day',
        description: `Everything the group page shows for one day (\`today\` = the group’s local date): who posted, is late or out of office, the posted updates with linked tasks, reactions and replies, the blockers (that day’s plus earlier ones still open, open first) and the caller’s own update or draft. 400 \`INVALID_DATE\` for a day that hasn’t started. ${MEMBERS_ONLY}`,
        params: dayParams,
        response: { 200: standupDaySchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { group, role } = await loadStandupGroupAccess(request, request.params.groupId, {
        member: true,
      });
      const now = app.clock();
      const date = resolveDate(group, request.params.date, now);
      return buildStandupDay(app.db, group, viewerOf(request, role), date, now);
    },
  );

  app.get(
    '/standup-groups/:groupId/suggestions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Suggest my standup update',
        description: `For the caller: Yesterday rows from their own activity since the previous standup day’s post-by time (Completed, Moved to review, Commented on; each task once, strongest kind), and Today chips from their open tasks (Overdue, Due today, In progress). \`date\` defaults to the group’s today. ${MEMBERS_ONLY}`,
        params: groupParams,
        querystring: standupSuggestionsQuerySchema,
        response: { 200: standupSuggestionsSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { group } = await loadStandupGroupAccess(request, request.params.groupId, {
        member: true,
      });
      const now = app.clock();
      const date = resolveDate(group, request.query.date ?? 'today', now);
      return buildSuggestions(app.db, group, requireAuth(request).user.id, date, now);
    },
  );

  app.put(
    '/standup-groups/:groupId/days/:date/entry',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Save or post my standup update',
        description: `The whole update (items and blockers). \`status: draft\` saves privately; \`posted\` publishes it (stamps the post time and the late flag: after the group’s post-by time). Editing a posted update sets \`editedAt\`; it can’t go back to draft (409 \`ALREADY_POSTED\`). Only on the group’s today, until it ends in the group’s zone: 409 \`STANDUP_DAY_CLOSED\` for an earlier day, 400 \`INVALID_DATE\` for a later one, 409 \`NOT_STANDUP_DAY\`, 409 \`GROUP_ARCHIVED\`. Blockers keep their \`id\` (resolved state, replies) across saves; ones left out are deleted. Helpers must be other group members (400 \`INVALID_HELPER\`) and are notified when first named on a posted blocker; linked tasks must be in the workspace (400 \`INVALID_TASK\`). Writes no task activity. ${MEMBERS_ONLY}`,
        params: dayParams,
        body: saveStandupEntrySchema,
        response: {
          200: standupEntrySchema,
          400: err,
          401: err,
          403: err,
          404: err,
          409: err,
        },
      },
    },
    async (request) => {
      const { group, role } = await loadStandupGroupAccess(request, request.params.groupId, {
        member: true,
      });
      const { user } = requireAuth(request);
      const now = app.clock();
      const date = request.params.date === 'today' ? groupToday(group, now) : request.params.date;
      const { saved, current } = await app.db.transaction(async (tx) => {
        await lockGroup(tx, group.id);
        const current = one(
          await tx.select().from(standupGroups).where(eq(standupGroups.id, group.id)),
          'standup group',
        );
        return { saved: await saveEntry(tx, current, user.id, date, request.body, now), current };
      });
      if (saved.changed && saved.entry.status === 'posted') {
        await publishStandup(
          app,
          current,
          saved.posted ? 'standup.entry_posted' : 'standup.entry_updated',
          { date, entryId: saved.entry.id, actorId: user.id, clientId: clientIdOf(request) },
        );
      }
      publishBlockedChanged(app, current.workspaceId, saved.blockedTaskIds);
      for (const { blockerId, userIds } of saved.newHelpers) {
        await notifyStandup(app, {
          group: current,
          date,
          entryId: saved.entry.id,
          blockerId,
          actorId: user.id,
          candidates: new Map(userIds.map((id) => [id, ['standup_help']])),
        });
      }
      const [entry] = await entryViews(app.db, current, [saved.entry], viewerOf(request, role));
      if (!entry) throw httpError(404, 'NOT_FOUND', 'Standup update not found');
      return entry;
    },
  );

  for (const resolve of [true, false]) {
    app.route({
      method: resolve ? 'POST' : 'DELETE',
      url: '/standup-blockers/:blockerId/resolve',
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: resolve ? 'Resolve a blocker' : 'Reopen a blocker',
        description: `${resolve ? 'Marks it resolved and notifies its author (unless they resolved it)' : 'Marks it open again'}; the linked task’s "Blocked" marker follows. Idempotent. For the blocker’s author, its helpers, the group’s facilitator and admins/owners in the group (403 otherwise); works on past days too. ${MEMBERS_ONLY}`,
        params: blockerParams,
        response: { 200: standupBlockerSchema, 401: err, 403: err, 404: err, 409: err },
      },
      handler: async (request) => {
        const { group, role, entry, blocker } = await loadStandupBlockerAccess(
          request,
          request.params.blockerId,
        );
        const viewer = viewerOf(request, role);
        if (!canResolveBlocker(blocker, entry.userId, group, viewer)) {
          throw httpError(403, 'FORBIDDEN', 'Only the author, helpers or facilitator can do this');
        }
        assertActive(group);
        const now = app.clock();
        const [updated] = await app.db
          .update(standupBlockers)
          .set(
            resolve
              ? { resolvedAt: now, resolvedBy: viewer.userId }
              : { resolvedAt: null, resolvedBy: null },
          )
          .where(
            and(
              eq(standupBlockers.id, blocker.id),
              resolve ? isNull(standupBlockers.resolvedAt) : isNotNull(standupBlockers.resolvedAt),
            ),
          )
          .returning();
        if (updated) {
          await publishStandup(app, group, 'standup.blocker_changed', {
            date: entry.date,
            entryId: entry.id,
            actorId: viewer.userId,
            clientId: clientIdOf(request),
          });
          if (group.markLinkedTasksBlocked && updated.taskId) {
            publishBlockedChanged(app, group.workspaceId, [updated.taskId]);
          }
          if (resolve) {
            await notifyStandup(app, {
              group,
              date: entry.date,
              entryId: entry.id,
              blockerId: blocker.id,
              actorId: viewer.userId,
              candidates: new Map([[entry.userId, ['standup_resolved']]]),
            });
          }
        }
        const [view] = await blockerViews(
          app.db,
          group,
          [{ blocker: updated ?? blocker, entry }],
          viewer,
        );
        if (!view) throw httpError(404, 'NOT_FOUND', 'Blocker not found');
        return view;
      },
    });
  }

  for (const add of [true, false]) {
    app.route({
      method: add ? 'PUT' : 'DELETE',
      url: '/standup-entries/:entryId/reactions/:emoji',
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: add ? 'React to a standup update' : 'Remove my reaction',
        description: `Idempotent; returns the update’s reaction pills. Posted updates only (409 \`NOT_POSTED\`); works on past days too. Reactions don’t notify. ${MEMBERS_ONLY}`,
        params: reactionParams,
        response: {
          200: z.array(standupReactionSummarySchema),
          401: err,
          403: err,
          404: err,
          409: err,
        },
      },
      handler: async (request) => {
        const { group, entry } = await loadStandupEntryAccess(request, request.params.entryId);
        assertPosted(entry);
        assertActive(group);
        const { user } = requireAuth(request);
        const { emoji } = request.params;
        const changed = add
          ? await app.db
              .insert(standupReactions)
              .values({ entryId: entry.id, userId: user.id, emoji, createdAt: app.clock() })
              .onConflictDoNothing()
              .returning({ entryId: standupReactions.entryId })
          : await app.db
              .delete(standupReactions)
              .where(
                and(
                  eq(standupReactions.entryId, entry.id),
                  eq(standupReactions.userId, user.id),
                  eq(standupReactions.emoji, emoji),
                ),
              )
              .returning({ entryId: standupReactions.entryId });
        if (changed.length > 0) {
          await publishStandup(app, group, 'standup.reaction', {
            date: entry.date,
            entryId: entry.id,
            actorId: user.id,
            clientId: clientIdOf(request),
          });
        }
        return reactionSummary(app.db, entry.id, user.id);
      },
    });
  }

  /** Mentions limited to the group's active members (others couldn't read the reply). */
  async function groupMentions(group: GroupRow, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const members = new Set(await activeGroupMemberIds(app.db, group));
    return [...new Set(ids)].filter((id) => members.has(id));
  }

  app.post(
    '/standup-entries/:entryId/replies',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Reply to a standup update',
        description: `Plain text, on the update or one of its blockers (\`blockerId\`, 400 \`INVALID_BLOCKER\` if it isn’t the update’s). \`mentionIds\` are kept for group members only and notified (\`mention\`); the update’s author gets \`standup_reply\`. Posted updates only (409 \`NOT_POSTED\`); works on past days too. ${MEMBERS_ONLY}`,
        params: entryParams,
        body: createStandupReplySchema,
        response: { 201: standupReplySchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { group, entry } = await loadStandupEntryAccess(request, request.params.entryId);
      assertPosted(entry);
      assertActive(group);
      const { user } = requireAuth(request);
      const { body, blockerId, mentionIds } = request.body;
      if (blockerId) {
        const [own] = await app.db
          .select({ id: standupBlockers.id })
          .from(standupBlockers)
          .where(and(eq(standupBlockers.id, blockerId), eq(standupBlockers.entryId, entry.id)));
        if (!own) throw httpError(400, 'INVALID_BLOCKER', 'That blocker isn’t part of this update');
      }
      const mentions = await groupMentions(group, mentionIds);
      const created = one(
        await app.db
          .insert(standupReplies)
          .values({
            entryId: entry.id,
            blockerId: blockerId ?? null,
            authorId: user.id,
            body,
            mentionIds: mentions,
            createdAt: app.clock(),
          })
          .returning(),
        'reply',
      );
      await publishStandup(app, group, 'standup.reply', {
        date: entry.date,
        entryId: entry.id,
        actorId: user.id,
        clientId: clientIdOf(request),
      });
      const candidates = new Map<string, NotificationType[]>(
        mentions.map((id) => [id, ['mention']]),
      );
      candidates.set(entry.userId, [...(candidates.get(entry.userId) ?? []), 'standup_reply']);
      await notifyStandup(app, {
        group,
        date: entry.date,
        entryId: entry.id,
        blockerId: created.blockerId,
        replyId: created.id,
        actorId: user.id,
        candidates,
      });
      return reply.code(201).send(await replyDto(app.db, group.workspaceId, created));
    },
  );

  /** The caller's own reply (403 for anyone else's). */
  async function ownReply(request: FastifyRequest, replyId: string) {
    const access = await loadStandupReplyAccess(request, replyId);
    if (access.reply.authorId !== requireAuth(request).user.id) {
      throw httpError(403, 'FORBIDDEN', 'Only the author can change a reply');
    }
    assertActive(access.group);
    return access;
  }

  app.patch(
    '/standup-replies/:replyId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Edit my reply',
        description: `The author only (403). Newly mentioned group members are notified. ${MEMBERS_ONLY}`,
        params: replyParams,
        body: updateStandupReplySchema,
        response: { 200: standupReplySchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { group, entry, reply } = await ownReply(request, request.params.replyId);
      const { user } = requireAuth(request);
      const mentions = await groupMentions(group, request.body.mentionIds);
      const same =
        reply.body === request.body.body &&
        JSON.stringify(reply.mentionIds) === JSON.stringify(mentions);
      if (same) return replyDto(app.db, group.workspaceId, reply);
      const updated = one(
        await app.db
          .update(standupReplies)
          .set({ body: request.body.body, mentionIds: mentions, editedAt: app.clock() })
          .where(eq(standupReplies.id, reply.id))
          .returning(),
        'reply',
      );
      await publishStandup(app, group, 'standup.reply', {
        date: entry.date,
        entryId: entry.id,
        actorId: user.id,
        clientId: clientIdOf(request),
      });
      const added = mentions.filter((id) => !reply.mentionIds.includes(id));
      if (added.length > 0) {
        await notifyStandup(app, {
          group,
          date: entry.date,
          entryId: entry.id,
          blockerId: updated.blockerId,
          replyId: updated.id,
          actorId: user.id,
          candidates: new Map(added.map((id) => [id, ['mention']])),
        });
      }
      return replyDto(app.db, group.workspaceId, updated);
    },
  );

  app.delete(
    '/standup-replies/:replyId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Delete my reply',
        description: `The author only (403); can’t be undone. ${MEMBERS_ONLY}`,
        params: replyParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { group, entry, reply: row } = await ownReply(request, request.params.replyId);
      await app.db.delete(standupReplies).where(eq(standupReplies.id, row.id));
      await publishStandup(app, group, 'standup.reply', {
        date: entry.date,
        entryId: entry.id,
        actorId: requireAuth(request).user.id,
        clientId: clientIdOf(request),
      });
      return reply.code(204).send(null);
    },
  );

  done();
};
