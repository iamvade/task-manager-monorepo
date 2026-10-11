import type { RealtimeTaskMessage } from '@kite/shared';
import type { TaskEvent } from '../events/bus.js';

/**
 * The realtime message of a bus event: ids plus the minimal changed data, never the row (clients
 * patch what they can and refetch the rest). Restores read as a create, attachment changes as an
 * update, and comment edits/deletes as `comment.changed`.
 */
export function toRealtime(event: TaskEvent): RealtimeTaskMessage | null {
  const base = {
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    taskId: event.taskId,
    actorId: event.actorId,
    at: event.at.toISOString(),
  };
  const changes = event.activities.map((a) => a.type);

  switch (event.type) {
    case 'task.created':
      return { type: 'task.created', ...base };
    case 'task.restored':
      return { type: 'task.created', ...base, restored: true };
    case 'task.updated':
    case 'attachment.changed': {
      const fromProjectId = movedFrom(event);
      return { type: 'task.updated', ...base, changes, ...(fromProjectId && { fromProjectId }) };
    }
    case 'task.moved':
      return event.move
        ? { type: 'task.moved', ...base, ...event.move }
        : { type: 'task.updated', ...base, changes };
    case 'task.deleted':
      return { type: 'task.deleted', ...base };
    case 'comment.created':
      return event.commentId
        ? { type: 'comment.created', ...base, commentId: event.commentId }
        : null;
    case 'comment.updated':
    case 'comment.deleted':
      return event.commentId
        ? { type: 'comment.changed', ...base, commentId: event.commentId }
        : null;
    case 'subtask.changed':
      return event.subtaskId
        ? { type: 'subtask.changed', ...base, subtaskId: event.subtaskId }
        : null;
  }
}

/** The source project of a move to another project (from its `project.changed` row). */
function movedFrom(event: TaskEvent): string | undefined {
  const row = event.activities.find((a) => a.type === 'project.changed');
  const from = row?.payload.from;
  if (
    from &&
    typeof from === 'object' &&
    'projectId' in from &&
    typeof from.projectId === 'string'
  ) {
    return from.projectId;
  }
  return undefined;
}
