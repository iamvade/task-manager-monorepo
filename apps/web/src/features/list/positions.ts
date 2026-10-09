import type { TaskListItem } from '@kite/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { isTempTask } from '../../api/tasks';

export interface Placement {
  prevId: string | null;
  nextId: string | null;
  /** Fractional key for the optimistic row (the server allocates the real one). */
  position: string;
}

/**
 * Where a task lands in a status, from its visual neighbours after a drop. The list may be
 * sorted by due date or priority, so the neighbours are re-read in position order: the task
 * goes right after `afterId` (or right before `beforeId`, or at the end), and the ids sent to
 * `/move` are adjacent in position order so the server never sees them crossed.
 */
export function placeInStatus(
  statusTasks: readonly TaskListItem[],
  taskId: string,
  afterId: string | null,
  beforeId: string | null,
): Placement {
  const sorted = statusTasks
    .filter((t) => t.id !== taskId && !isTempTask(t))
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  let index = sorted.length;
  const after = afterId ? sorted.findIndex((t) => t.id === afterId) : -1;
  const before = beforeId ? sorted.findIndex((t) => t.id === beforeId) : -1;
  if (after >= 0) index = after + 1;
  else if (before >= 0) index = before;
  const prev = sorted[index - 1] ?? null;
  const next = sorted[index] ?? null;
  return {
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
    position: generateKeyBetween(prev?.position ?? null, next?.position ?? null),
  };
}
