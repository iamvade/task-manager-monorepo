import type { ProjectDetail, Status, TaskListItem, WorkspaceMember } from '@kite/shared';
import { useRef } from 'react';
import { useCreateTask } from '../../api/tasks';
import { useViewParams } from '../views/useViewParams';
import { placeInStatus } from './positions';

export const statusRef = (s: Status): TaskListItem['status'] => ({
  id: s.id,
  name: s.name,
  category: s.category,
  color: s.color,
});

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
  const tempSeq = useRef(0);

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
    const now = new Date().toISOString();
    tempSeq.current += 1;
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
      optimistic: {
        id: `temp-${String(tempSeq.current)}`,
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
        title,
        priority: defaults.priority ?? 'none',
        startDate: null,
        dueDate: null,
        position: placeInStatus(
          tasks.filter((x) => x.status.id === status.id),
          '',
          null,
          null,
        ).position,
        sprintId,
        completedAt: status.category === 'done' ? now : null,
        createdAt: now,
        updatedAt: now,
        assignees,
        tags: [],
        subtaskProgress: { done: 0, total: 0 },
        commentCount: 0,
        attachmentCount: 0,
      },
    });
  };
}
