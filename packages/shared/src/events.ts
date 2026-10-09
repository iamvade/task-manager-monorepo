/**
 * Domain events the API emits on its internal bus after a transaction commits. Notifications
 * (phase 7) and realtime (phase 16) subscribe to them.
 */
export const TASK_EVENT_TYPES = [
  'task.created',
  'task.updated',
  'task.moved',
  'task.deleted',
  'task.restored',
  'subtask.changed',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'attachment.changed',
] as const;
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];
