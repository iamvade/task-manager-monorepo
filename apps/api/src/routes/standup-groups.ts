import {
  apiErrorSchema,
  canCreateStandupGroup,
  createStandupGroupSchema,
  moveSchema,
  standupGroupSchema,
  standupTimesInOrder,
  updateStandupGroupSchema,
} from '@kite/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadStandupGroupAccess, requireWorkspaceMember } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { movePosition } from '../db/position.js';
import { one } from '../db/rows.js';
import { standupGroupMembers, standupGroups } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';
import {
  appendGroupMember,
  groupDtos,
  lockGroup,
  requireActiveMembers,
  setGroupMembers,
} from '../standups/groups.js';

const err = apiErrorSchema;
const groupParams = z.object({ groupId: z.uuid() });
const memberParams = groupParams.extend({ userId: z.uuid() });
const MANAGE = 'Admins, owners and the group’s facilitator; other members get 403.';

/** Tells the workspace's other tabs to refetch standup groups (sidebar, settings). */
function broadcastGroupsChanged(
  app: FastifyInstance,
  request: FastifyRequest,
  workspaceId: string,
) {
  const { user } = requireAuth(request);
  app.realtime.broadcaster.publish({
    to: { workspaceId },
    exceptClientId: clientIdOf(request),
    message: {
      type: 'standup.groups.changed',
      workspaceId,
      actorId: user.id,
      at: new Date().toISOString(),
    },
  });
}

export const standupGroupRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** The group's DTO for the caller (re-read after a write). */
  async function dto(request: FastifyRequest, groupId: string) {
    const { group, role } = await loadStandupGroupAccess(request, groupId);
    const [result] = await groupDtos(
      app.db,
      [group],
      { userId: requireAuth(request).user.id, role },
      app.clock(),
    );
    if (!result) throw httpError(404, 'NOT_FOUND', 'Standup group not found');
    return result;
  }

  app.get(
    '/workspaces/:workspaceId/standup-groups',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'List standup groups',
        description:
          'Every non-archived group of the workspace (groups are visible to all members), by name, with today’s state for the caller: `isMember`, `canEdit`, `meetsToday`, `myPosted`, `hasPosts`.',
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(standupGroupSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      const caller = await requireWorkspaceMember(request, workspaceId);
      const groups = await app.db
        .select()
        .from(standupGroups)
        .where(and(eq(standupGroups.workspaceId, workspaceId), isNull(standupGroups.archivedAt)))
        .orderBy(asc(standupGroups.name), asc(standupGroups.id));
      return groupDtos(app.db, groups, caller, app.clock());
    },
  );

  app.post(
    '/workspaces/:workspaceId/standup-groups',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Create a standup group',
        description:
          'Admin or owner. Starts with the default schedule (Mon–Fri, post by 10:00, reminder 09:30, meeting 10:15, Ulaanbaatar). Members default to the creator, who becomes facilitator when listed. 400 `INVALID_MEMBER` for someone who isn’t an active member.',
        params: z.object({ workspaceId: z.uuid() }),
        body: createStandupGroupSchema,
        response: { 201: standupGroupSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const caller = await requireWorkspaceMember(request, workspaceId);
      if (!canCreateStandupGroup(caller.role)) {
        throw httpError(403, 'FORBIDDEN', 'Only admins can create standup groups');
      }
      const memberIds = request.body.memberIds ?? [caller.userId];
      await requireActiveMembers(app.db, workspaceId, memberIds);
      const group = await app.db.transaction(async (tx) => {
        const created = one(
          await tx
            .insert(standupGroups)
            .values({
              workspaceId,
              name: request.body.name,
              facilitatorId: memberIds.includes(caller.userId) ? caller.userId : null,
              createdBy: caller.userId,
            })
            .returning(),
          'standup group',
        );
        await setGroupMembers(tx, created.id, memberIds, app.clock());
        return created;
      });
      broadcastGroupsChanged(app, request, workspaceId);
      return reply.code(201).send(await dto(request, group.id));
    },
  );

  app.get(
    '/standup-groups/:groupId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Get a standup group',
        description: 'Settings and members. Archived groups too (for Undo).',
        params: groupParams,
        response: { 200: standupGroupSchema, 401: err, 404: err },
      },
    },
    async (request) => dto(request, request.params.groupId),
  );

  app.patch(
    '/standup-groups/:groupId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Update a standup group',
        description: `${MANAGE} Any subset of the settings; \`memberIds\` replaces the member list in that order. The facilitator must be a member (400 \`INVALID_FACILITATOR\`); removing them clears it. Times are \`HH:mm\` in the group’s zone on 15-minute steps, reminder before post-by, meeting at or after it (400).`,
        params: groupParams,
        body: updateStandupGroupSchema,
        response: { 200: standupGroupSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { group } = await loadStandupGroupAccess(request, request.params.groupId, {
        manage: true,
      });
      const { memberIds, ...settings } = request.body;
      const times = {
        postBy: settings.postBy ?? group.postBy.slice(0, 5),
        reminderAt:
          settings.reminderAt !== undefined
            ? settings.reminderAt
            : (group.reminderAt?.slice(0, 5) ?? null),
        meetingAt:
          settings.meetingAt !== undefined
            ? settings.meetingAt
            : (group.meetingAt?.slice(0, 5) ?? null),
      };
      if (!standupTimesInOrder(times)) {
        throw httpError(
          400,
          'INVALID_SCHEDULE',
          'The reminder must be before the post-by time, and the meeting at or after it',
        );
      }
      if (memberIds) await requireActiveMembers(app.db, group.workspaceId, memberIds);

      await app.db.transaction(async (tx) => {
        await lockGroup(tx, group.id);
        if (memberIds) await setGroupMembers(tx, group.id, memberIds, app.clock());
        const members = (
          await tx
            .select({ userId: standupGroupMembers.userId })
            .from(standupGroupMembers)
            .where(eq(standupGroupMembers.groupId, group.id))
        ).map((m) => m.userId);
        let facilitatorId =
          settings.facilitatorId !== undefined ? settings.facilitatorId : group.facilitatorId;
        if (facilitatorId !== null && !members.includes(facilitatorId)) {
          if (settings.facilitatorId !== undefined) {
            throw httpError(400, 'INVALID_FACILITATOR', 'The facilitator must be a group member');
          }
          facilitatorId = null;
        }
        await tx
          .update(standupGroups)
          .set({ ...settings, facilitatorId })
          .where(eq(standupGroups.id, group.id));
      });
      broadcastGroupsChanged(app, request, group.workspaceId);
      return dto(request, group.id);
    },
  );

  for (const [action, archived] of [
    ['archive', true],
    ['restore', false],
  ] as const) {
    app.post(
      `/standup-groups/:groupId/${action}`,
      {
        preHandler: app.authenticate,
        schema: {
          tags: ['Standups'],
          summary: archived ? 'Archive a standup group' : 'Restore an archived standup group',
          description: `${MANAGE} ${
            archived
              ? 'Hides it from the sidebar and the list; posts are kept. Undo with restore.'
              : 'Brings it back with its members and posts.'
          }`,
          params: groupParams,
          response: { 200: standupGroupSchema, 401: err, 403: err, 404: err },
        },
      },
      async (request) => {
        const { group } = await loadStandupGroupAccess(request, request.params.groupId, {
          manage: true,
        });
        await app.db
          .update(standupGroups)
          .set({ archivedAt: archived ? (group.archivedAt ?? app.clock()) : null })
          .where(eq(standupGroups.id, group.id));
        broadcastGroupsChanged(app, request, group.workspaceId);
        return dto(request, group.id);
      },
    );
  }

  app.put(
    '/standup-groups/:groupId/members/:userId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Add a member to a standup group',
        description: `${MANAGE} Appended at the end; no-op when already a member. 400 \`INVALID_MEMBER\` unless an active workspace member.`,
        params: memberParams,
        response: { 200: standupGroupSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { groupId, userId } = request.params;
      const { group } = await loadStandupGroupAccess(request, groupId, { manage: true });
      await requireActiveMembers(app.db, group.workspaceId, [userId]);
      await app.db.transaction(async (tx) => {
        await lockGroup(tx, group.id);
        await appendGroupMember(tx, group.id, userId, app.clock());
      });
      broadcastGroupsChanged(app, request, group.workspaceId);
      return dto(request, group.id);
    },
  );

  app.delete(
    '/standup-groups/:groupId/members/:userId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Remove a member from a standup group',
        description: `${MANAGE} Clears the facilitator when it was them; their past posts stay. No-op when not a member.`,
        params: memberParams,
        response: { 200: standupGroupSchema, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { groupId, userId } = request.params;
      const { group } = await loadStandupGroupAccess(request, groupId, { manage: true });
      await app.db.transaction(async (tx) => {
        await lockGroup(tx, group.id);
        await tx
          .delete(standupGroupMembers)
          .where(
            and(eq(standupGroupMembers.groupId, group.id), eq(standupGroupMembers.userId, userId)),
          );
        if (group.facilitatorId === userId) {
          await tx
            .update(standupGroups)
            .set({ facilitatorId: null })
            .where(eq(standupGroups.id, group.id));
        }
      });
      broadcastGroupsChanged(app, request, group.workspaceId);
      return dto(request, group.id);
    },
  );

  app.post(
    '/standup-groups/:groupId/members/:userId/move',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Reorder a standup group member',
        description: `${MANAGE} Send the neighbors after the move (\`prevId\`, \`nextId\` are user ids; \`null\` = list edge). 404 when the person isn’t in the group.`,
        params: memberParams,
        body: moveSchema,
        response: { 200: standupGroupSchema, 400: err, 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { groupId, userId } = request.params;
      const { group } = await loadStandupGroupAccess(request, groupId, { manage: true });
      await app.db.transaction(async (tx) => {
        await lockGroup(tx, group.id);
        const rows = await tx
          .select({ id: standupGroupMembers.userId, position: standupGroupMembers.position })
          .from(standupGroupMembers)
          .where(eq(standupGroupMembers.groupId, group.id));
        if (!rows.some((r) => r.id === userId)) {
          throw httpError(404, 'NOT_FOUND', 'Not a member of this group');
        }
        const position = movePosition(rows, userId, request.body);
        await tx
          .update(standupGroupMembers)
          .set({ position })
          .where(
            and(eq(standupGroupMembers.groupId, group.id), eq(standupGroupMembers.userId, userId)),
          );
      });
      broadcastGroupsChanged(app, request, group.workspaceId);
      return dto(request, group.id);
    },
  );

  done();
};
