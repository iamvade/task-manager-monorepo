import type {
  ProjectDetail,
  Sprint,
  Tag,
  TaskDetail,
  UserRef,
  WorkspaceMember,
  WorkspaceRole,
} from '@kite/shared';
import { createContext, useContext } from 'react';
import type { MentionCandidate } from '../../components/editor/mentions';

/** Everything the drawer's sections share: the task, its project and the people around it. */
export interface TaskView {
  task: TaskDetail;
  project: ProjectDetail | undefined;
  members: readonly WorkspaceMember[];
  /** The project's team (suggested assignees / mentions first). */
  teamIds: ReadonlySet<string>;
  /** Workspace members for @-suggestions, team first, with role hints. */
  mentions: readonly MentionCandidate[];
  tags: readonly Tag[];
  sprints: readonly Sprint[];
  me: UserRef;
  /** The caller's workspace role (admins may delete others' comments and attachments). */
  role: WorkspaceRole;
  layout: 'drawer' | 'page';
  /** Closes the drawer (or leaves the full page). */
  close: () => void;
  /** Uploads files to the task (attach button, drop on the drawer, composer paperclip). */
  upload: (files: Iterable<File>) => void;
}

export const TaskViewContext = createContext<TaskView | null>(null);

export function useTaskView(): TaskView {
  const view = useContext(TaskViewContext);
  if (!view) throw new Error('useTaskView outside TaskDetailView');
  return view;
}

export const canModerate = (role: WorkspaceRole) => role === 'owner' || role === 'admin';
