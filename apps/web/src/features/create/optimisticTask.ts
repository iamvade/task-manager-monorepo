import type { Priority, ProjectDetail, Status, Tag, TaskListItem, UserRef } from '@kite/shared';
import { placeInStatus } from '../list/positions';

export const statusRef = (s: Status): TaskListItem['status'] => ({
  id: s.id,
  name: s.name,
  category: s.category,
  color: s.color,
});

interface OptimisticFields {
  title: string;
  priority?: Priority;
  assignees?: UserRef[];
  tags?: Tag[];
  dueDate?: string | null;
  sprintId?: string | null;
}

let tempSeq = 0;

/**
 * The temporary row shown while a create is in flight (inline add, quick create): `temp-N`
 * id, `APP-…` key, placed at the end of `status` among `knownTasks` (whatever the client has
 * for that project).
 */
export function buildOptimisticTask(
  project: Pick<ProjectDetail, 'id' | 'spaceId' | 'key' | 'name' | 'color'>,
  status: Status,
  fields: OptimisticFields,
  knownTasks: readonly TaskListItem[] = [],
): TaskListItem {
  const now = new Date().toISOString();
  tempSeq += 1;
  return {
    id: `temp-${String(tempSeq)}`,
    key: `${project.key}-…`,
    number: 0,
    project: {
      id: project.id,
      spaceId: project.spaceId,
      key: project.key,
      name: project.name,
      color: project.color,
    },
    status: statusRef(status),
    title: fields.title,
    priority: fields.priority ?? 'none',
    startDate: null,
    dueDate: fields.dueDate ?? null,
    position: placeInStatus(
      knownTasks.filter((x) => x.status.id === status.id),
      '',
      null,
      null,
    ).position,
    sprintId: fields.sprintId ?? null,
    completedAt: status.category === 'done' ? now : null,
    createdAt: now,
    updatedAt: now,
    assignees: fields.assignees ?? [],
    tags: fields.tags ?? [],
    subtaskProgress: { done: 0, total: 0 },
    commentCount: 0,
    attachmentCount: 0,
  };
}
