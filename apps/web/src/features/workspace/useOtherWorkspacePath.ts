import type { SidebarResponse } from '@kite/shared';
import { useQueries } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { sidebarQuery, useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { appPath, wsPath } from '../../lib/paths';

/**
 * The same page (path, query, hash) in workspace `workspaceId` when that's another of my
 * workspaces: a link to a project, group or task opened under the wrong (or no) workspace.
 */
export function useOtherWorkspacePath(workspaceId: string | undefined): string | null {
  const current = useCurrentWorkspace();
  const { me } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (!workspaceId || workspaceId === current?.id) return null;
  const other = me?.workspaces.find((w) => w.id === workspaceId);
  return other ? `${wsPath(other.slug, appPath(pathname))}${search}${hash}` : null;
}

/**
 * For pages that know only an id or key (a space, a task key) that isn't in this workspace:
 * the first of my other workspaces whose sidebar has it. Loads their sidebars only when `enabled`.
 */
export function useFoundInOtherWorkspace(
  match: (sidebar: SidebarResponse) => boolean,
  enabled: boolean,
): string | undefined {
  const current = useCurrentWorkspace();
  const { me } = useAuth();
  const others = (me?.workspaces ?? []).filter((w) => w.id !== current?.id);
  const sidebars = useQueries({
    queries: others.map((w) => ({ ...sidebarQuery(w.id), enabled })),
  });
  return others.find((_, i) => {
    const data = sidebars[i]?.data;
    return data !== undefined && match(data);
  })?.id;
}
