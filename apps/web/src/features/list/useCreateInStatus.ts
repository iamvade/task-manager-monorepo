import type { ProjectDetail, Status, TaskListItem, WorkspaceMember } from '@kite/shared';
import { useCreateTask } from '../../api/tasks';
import { buildOptimisticTask } from '../create/optimisticTask';
import { useViewParams } from '../views/useViewParams';

export { statusRef } from '../create/optimisticTask';

export interface CreateDefaults {
  assigneeIds?: string[];
  priority?: TaskListItem['priority'];
}

/**
 * Inline "Add task" (List group, Board column): creates `title` at the end of `status` with a
 * temporary row shown right away. New tasks inherit the sprint the view is filtered to.
 */
export function useCreateInStatus(
  project: ProjectDetail | null,
  tasks: readonly TaskListItem[],
  members: readonly WorkspaceMember[],
) {
  const create = useCreateTask(project?.id ?? '');
  const { sprintId } = useViewParams();

  return (status: Status, title: string, defaults: CreateDefaults = {}) => {
    if (!project) return;
    const assignees = members
      .filter((m) => defaults.assigneeIds?.includes(m.user.id))
      .map(({ user: { id, name, initials, avatarColor } }) => ({
        id,
        name,
        initials,
        avatarColor,
      }));
    create.mutate({
      body: {
        title,
        statusId: status.id,
        ...(defaults.priority ? { priority: defaults.priority } : {}),
        ...(assignees.length ? { assigneeIds: assignees.map((a) => a.id) } : {}),
        // Keep the new task inside the sprint the view is filtered to.
        ...(sprintId ? { sprintId } : {}),
        position: 'bottom',
      },
      optimistic: buildOptimisticTask(
        project,
        status,
        { title, priority: defaults.priority, assignees, sprintId },
        tasks,
      ),
    });
  };
}
