import type { Priority, Size, Tag, TaskListItem, UserRef, WorkspaceMember } from '@kite/shared';
import { createContext, useContext } from 'react';

/** Data and actions every row of one List needs (provided by TaskTable). */
export interface ListActions {
  members: readonly WorkspaceMember[];
  /** Short display name, kept distinct when two members' short names collide. */
  shortNameOf: (user: UserRef) => string;
  /** Project team ids (assignee picker suggestions); empty on the space list. */
  teamIds: ReadonlySet<string>;
  tags: readonly Tag[];
  /** `?task=KEY` added to the current URL. */
  taskHref: (task: TaskListItem) => string;
  open: (task: TaskListItem) => void;
  select: (task: TaskListItem) => void;
  toggleComplete: (task: TaskListItem) => void;
  remove: (task: TaskListItem) => void;
  copyLink: (task: TaskListItem) => void;
  setAssignees: (task: TaskListItem, users: UserRef[]) => void;
  setDue: (task: TaskListItem, date: string | null) => void;
  setPriority: (task: TaskListItem, priority: Priority) => void;
  setSize: (task: TaskListItem, size: Size | null) => void;
  /** The optional Size column (toolbar Columns menu). */
  showSize: boolean;
  /** The task key before the title (toolbar Columns menu, on by default). */
  showKey: boolean;
  setTags: (task: TaskListItem, tags: Tag[]) => void;
}

export const ListContext = createContext<ListActions | null>(null);

export function useListActions(): ListActions {
  const actions = useContext(ListContext);
  if (!actions) throw new Error('useListActions must be used inside <TaskTable>');
  return actions;
}

export const isDone = (task: Pick<TaskListItem, 'status'>) => task.status.category === 'done';

/**
 * Main.dc.html grid: checkbox · name · assignee · due · priority · [size] · tags · more. Size is
 * optional (not in the designs) and sits next to priority.
 */
export const gridColumns = (showSize: boolean) =>
  `40px minmax(0, 1fr) 152px 120px 112px ${showSize ? '72px ' : ''}224px 40px`;
