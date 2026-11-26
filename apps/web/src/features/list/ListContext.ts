import {
  isClosedCategory,
  isParkedCategory,
  type Priority,
  type Size,
  type Status,
  type Tag,
  type TaskListItem,
  type UserRef,
  type WorkspaceMember,
} from '@kite/shared';
import { createContext, useContext } from 'react';

/** Data and actions every row of one List needs (provided by TaskTable). */
export interface ListActions {
  members: readonly WorkspaceMember[];
  /** Project team ids (assignee picker suggestions); empty on the space list. */
  teamIds: ReadonlySet<string>;
  tags: readonly Tag[];
  /** Project list: the project's statuses (row status picker). Null on the space list. */
  statuses: readonly Status[] | null;
  /** `?task=KEY` added to the current URL. */
  taskHref: (task: TaskListItem) => string;
  open: (task: TaskListItem) => void;
  select: (task: TaskListItem) => void;
  toggleComplete: (task: TaskListItem) => void;
  setStatus: (task: TaskListItem, status: Status) => void;
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
  /** Project list: the select column for multi-select (bulk bar). */
  selectable: boolean;
  /** Any row selected: the select boxes stay visible. */
  anySelected: boolean;
  isSelected: (task: TaskListItem) => boolean;
  /** Toggles one row; `range` (shift-click) selects from the last toggled row to this one. */
  toggleSelected: (task: TaskListItem, range: boolean) => void;
  setTags: (task: TaskListItem, tags: Tag[]) => void;
}

export const ListContext = createContext<ListActions | null>(null);

export function useListActions(): ListActions {
  const actions = useContext(ListContext);
  if (!actions) throw new Error('useListActions must be used inside <TaskTable>');
  return actions;
}

export const isDone = (task: Pick<TaskListItem, 'status'>) => task.status.category === 'done';
/** Done or cancelled: struck through, no due tone, no Blocked marker. */
export const isClosed = (task: Pick<TaskListItem, 'status'>) =>
  isClosedCategory(task.status.category);
/** Closed or parked (Backlog): its due date gets no overdue/today tone. */
export const isUntimed = (task: Pick<TaskListItem, 'status'>) =>
  isClosedCategory(task.status.category) || isParkedCategory(task.status.category);

/**
 * Main.dc.html grid: [select (project list, not designed)] · name · assignee · tags · [size] · due · more (tags before size and due: user decision 2026-11-27). The name cell reads priority · key · status · title:
 * priority and status (the design's checkbox, its own column there) are icon buttons in it (Linear-style, user decisions
 * 2026-11-27); size is optional (not in the designs).
 */
export const gridColumns = (showSize: boolean, selectable = false) =>
  `${selectable ? '28px ' : ''}minmax(0, 1fr) 96px 224px ${showSize ? '72px ' : ''}120px 40px`;
