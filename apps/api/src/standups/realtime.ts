import type { StandupMeeting, StandupMessageType } from '@kite/shared';
import type { FastifyInstance } from 'fastify';
import type { standupGroups } from '../db/schema/index.js';
import { activeGroupMemberIds } from './schedule.js';

type GroupRow = typeof standupGroups.$inferSelect;

/**
 * Tells the group's members' other tabs that a standup day changed (they refetch it). Only the
 * group's members get it: standup content is theirs. Sent after commit.
 */
export async function publishStandup(
  app: FastifyInstance,
  group: GroupRow,
  type: StandupMessageType,
  change: { date: string; entryId: string; actorId: string; clientId?: string | undefined },
): Promise<void> {
  const userIds = await activeGroupMemberIds(app.db, group);
  if (userIds.length === 0) return;
  app.realtime.broadcaster.publish({
    to: { workspaceId: group.workspaceId, userIds },
    exceptClientId: change.clientId,
    message: {
      type,
      workspaceId: group.workspaceId,
      groupId: group.id,
      date: change.date,
      entryId: change.entryId,
      actorId: change.actorId,
      at: app.clock().toISOString(),
    },
  });
}

/**
 * The "Blocked" marker of these tasks may have changed: everyone in the workspace refetches them
 * (ids only; the marker's text is filtered per viewer when read). The acting tab included, since
 * its task lists don't know about the change.
 */
export function publishBlockedChanged(
  app: FastifyInstance,
  workspaceId: string,
  taskIds: readonly string[],
): void {
  if (taskIds.length === 0) return;
  app.realtime.broadcaster.publish({
    to: { workspaceId },
    message: {
      type: 'tasks.blocked.changed',
      workspaceId,
      taskIds: [...new Set(taskIds)],
      at: app.clock().toISOString(),
    },
  });
}

/**
 * The day's meeting changed (started, moved on, ended, notes or tasks): the whole meeting goes to
 * the group's members so followers update at once. The acting tab already has it.
 */
export async function publishMeeting(
  app: FastifyInstance,
  group: GroupRow,
  change: {
    date: string;
    meeting: StandupMeeting;
    actorId: string;
    clientId?: string | undefined;
  },
): Promise<void> {
  const userIds = await activeGroupMemberIds(app.db, group);
  if (userIds.length === 0) return;
  app.realtime.broadcaster.publish({
    to: { workspaceId: group.workspaceId, userIds },
    exceptClientId: change.clientId,
    message: {
      type: 'standup.meeting_changed',
      workspaceId: group.workspaceId,
      groupId: group.id,
      date: change.date,
      actorId: change.actorId,
      at: app.clock().toISOString(),
      meeting: change.meeting,
    },
  });
}
