import { Navigate, useLocation } from 'react-router';
import { useCurrentWorkspace } from '../../api/workspaces';
import { wsPath } from '../../lib/paths';
import { NoWorkspacePage } from './NoWorkspacePage';

/**
 * `/` and every path without a workspace (old links: `/my-tasks`, `/p/:id/list`, `/t/APP-1`…):
 * the same page in the workspace used last (else the first). Pages whose project, space, group
 * or task is in another of my workspaces move there themselves (`useOtherWorkspacePath`).
 */
export function HomeRedirect() {
  const workspace = useCurrentWorkspace();
  const { pathname, search, hash } = useLocation();
  if (!workspace) return <NoWorkspacePage />;
  const path = pathname === '/' ? '/my-tasks' : pathname;
  return <Navigate to={`${wsPath(workspace.slug, path)}${search}${hash}`} replace />;
}

/** Index and unknown paths inside a workspace: its My Tasks. */
export function WorkspaceHome() {
  const workspace = useCurrentWorkspace();
  return <Navigate to={wsPath(workspace?.slug ?? '', '/my-tasks')} replace />;
}
