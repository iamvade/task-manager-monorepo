import type { Priority, Tag, TaskListItem, UserRef, WorkspaceMember } from '@kite/shared';
import { createContext, useContext } from 'react';

/** Data and actions every row of one List needs (provided by TaskTable). */
export interface ListActions {
  members: readonly WorkspaceMember[];
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
  setTags: (task: TaskListItem, tags: Tag[]) => void;
}

export const ListContext = createContext<ListActions | null>(null);

export function useListActions(): ListActions {
  const actions = useContext(ListContext);
  if (!actions) throw new Error('useListActions must be used inside <TaskTable>');
  return actions;
}

export const isDone = (task: Pick<TaskListItem, 'status'>) => task.status.category === 'done';

/** Main.dc.html grid: checkbox · name · assignee · due · priority · tags · more. */
export const GRID_COLUMNS = '40px minmax(0, 1fr) 152px 120px 112px 224px 40px';
