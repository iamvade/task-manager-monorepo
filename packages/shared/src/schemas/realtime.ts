import { z } from 'zod';
import { activityTypeSchema, notificationTypeSchema, sizeSchema } from '../enums.js';

/**
 * Realtime protocol of `GET /api/v1/ws`. The server pushes small typed messages after every
 * committed change in the subscribed workspace (never the full row: clients patch or refetch),
 * plus ephemeral presence kept in the WebSocket server's memory.
 */

/** Request header (and `?client=` on the socket URL) naming the browser tab that made a change. */
export const REALTIME_CLIENT_HEADER = 'x-kite-client';
/** Per-tab client id: the server skips sending a change back to the tab that made it. */
export const realtimeClientIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

/** Close codes: session gone (sign in again) and policy violation (no reconnect either). */
export const REALTIME_CLOSE_UNAUTHORIZED = 4401;
export const REALTIME_CLOSE_POLICY = 1008;

const taskBase = {
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  taskId: z.uuid(),
  /** Who made the change. */
  actorId: z.uuid(),
  at: z.iso.datetime(),
};

export const realtimeTaskMessageSchema = z.discriminatedUnion('type', [
  /** Also a restore (`restored: true`): the task is back in lists. */
  z.object({ type: z.literal('task.created'), ...taskBase, restored: z.literal(true).optional() }),
  z.object({
    type: z.literal('task.updated'),
    ...taskBase,
    /** Logged activity types of the change (empty for attachment changes without a log row). */
    changes: z.array(activityTypeSchema),
    /** Set when the task moved to another project (`projectId` is the destination). */
    fromProjectId: z.uuid().optional(),
    /** The new size, when `changes` has `size.changed`. */
    size: sizeSchema.nullable().optional(),
    /** The new reviewer, when `changes` has `reviewer.changed`. */
    reviewerId: z.uuid().nullable().optional(),
  }),
  z.object({
    type: z.literal('task.moved'),
    ...taskBase,
    statusId: z.uuid(),
    position: z.string(),
  }),
  z.object({ type: z.literal('task.deleted'), ...taskBase }),
  z.object({ type: z.literal('comment.created'), ...taskBase, commentId: z.uuid() }),
  /** A comment edit or delete. */
  z.object({ type: z.literal('comment.changed'), ...taskBase, commentId: z.uuid() }),
  z.object({ type: z.literal('subtask.changed'), ...taskBase, subtaskId: z.uuid() }),
]);
export type RealtimeTaskMessage = z.infer<typeof realtimeTaskMessageSchema>;

export const STANDUP_MESSAGE_TYPES = [
  'standup.entry_posted',
  'standup.entry_updated',
  'standup.blocker_changed',
  'standup.reaction',
  'standup.reply',
] as const;
export type StandupMessageType = (typeof STANDUP_MESSAGE_TYPES)[number];

export const realtimeServerMessageSchema = z.discriminatedUnion('type', [
  ...realtimeTaskMessageSchema.options,
  /** Sent to the recipient only. */
  z.object({
    type: z.literal('notification.created'),
    workspaceId: z.uuid(),
    /** Null for standup notifications. */
    taskId: z.uuid().nullable(),
    groupId: z.uuid().nullable(),
    actorId: z.uuid().nullable(),
    notificationId: z.uuid(),
    notificationType: notificationTypeSchema,
  }),
  /** A workspace tag was created, renamed, recolored, merged or deleted: refetch tags and tasks. */
  z.object({
    type: z.literal('tags.changed'),
    workspaceId: z.uuid(),
    actorId: z.uuid(),
    at: z.iso.datetime(),
  }),
  /** A standup group was created, edited, archived or restored, or its members changed. */
  z.object({
    type: z.literal('standup.groups.changed'),
    workspaceId: z.uuid(),
    actorId: z.uuid(),
    at: z.iso.datetime(),
  }),
  /**
   * A standup day changed: sent to the group's members only (never the content: refetch the day).
   * `entry_posted` / `entry_updated`: an update was posted or edited; `blocker_changed`: a blocker
   * was resolved or reopened; `reaction` / `reply`: a reaction or a reply changed.
   */
  z.object({
    type: z.enum(STANDUP_MESSAGE_TYPES),
    workspaceId: z.uuid(),
    groupId: z.uuid(),
    date: z.iso.date(),
    entryId: z.uuid(),
    actorId: z.uuid(),
    at: z.iso.datetime(),
  }),
  /** Standup blockers on these tasks opened or closed: refetch their `blocked` marker. */
  z.object({
    type: z.literal('tasks.blocked.changed'),
    workspaceId: z.uuid(),
    taskIds: z.array(z.uuid()),
    at: z.iso.datetime(),
  }),
  /** Someone's out-of-office periods changed: refetch members, pickers and Workload. */
  z.object({
    type: z.literal('absences.changed'),
    workspaceId: z.uuid(),
    userId: z.uuid(),
    actorId: z.uuid(),
    at: z.iso.datetime(),
  }),
  /** Reply to `subscribe`: who is online and who is viewing which task. */
  z.object({
    type: z.literal('ready'),
    workspaceId: z.uuid(),
    online: z.array(z.uuid()),
    viewers: z.record(z.string(), z.array(z.uuid())),
  }),
  z.object({ type: z.literal('presence.online'), workspaceId: z.uuid(), userId: z.uuid() }),
  z.object({ type: z.literal('presence.offline'), workspaceId: z.uuid(), userId: z.uuid() }),
  /** Everyone viewing a task now (empty when the last viewer left). */
  z.object({
    type: z.literal('presence.viewers'),
    workspaceId: z.uuid(),
    taskId: z.uuid(),
    userIds: z.array(z.uuid()),
  }),
  /** Keeps idle proxies open and lets the client notice a dead connection. */
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('error'), code: z.string() }),
]);
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;
export type RealtimeMessageType = RealtimeServerMessage['type'];

export const realtimeClientMessageSchema = z.discriminatedUnion('type', [
  /** Receive the workspace's changes and presence (one workspace per connection). */
  z.object({ type: z.literal('subscribe'), workspaceId: z.uuid() }),
  /** The task this tab shows (drawer or full page); `null` when none. */
  z.object({ type: z.literal('view'), taskId: z.uuid().nullable() }),
]);
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;
