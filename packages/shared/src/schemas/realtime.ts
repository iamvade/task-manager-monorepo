import { z } from 'zod';
import { activityTypeSchema, notificationTypeSchema } from '../enums.js';

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

export const realtimeServerMessageSchema = z.discriminatedUnion('type', [
  ...realtimeTaskMessageSchema.options,
  /** Sent to the recipient only. */
  z.object({
    type: z.literal('notification.created'),
    workspaceId: z.uuid(),
    taskId: z.uuid(),
    actorId: z.uuid(),
    notificationId: z.uuid(),
    notificationType: notificationTypeSchema,
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
