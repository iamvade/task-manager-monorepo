import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { useUiStore } from '../../stores/ui';
import { WorkspaceContext } from './WorkspaceContext';

/**
 * `/w/:slug/*`: the workspace the pages show comes from the URL, so each tab can show its own.
 * A slug that isn't one of my workspaces goes home (never saying whether it exists).
 */
export function WorkspaceLayout() {
  const { slug } = useParams();
  const { me } = useAuth();
  const workspace = me?.workspaces.find((w) => w.slug === slug);
  const lastId = useUiStore((s) => s.lastWorkspaceId);
  const setLast = useUiStore((s) => s.setLastWorkspace);
  // `/` and old links without a workspace open the one used last.
  useEffect(() => {
    if (workspace && workspace.id !== lastId) setLast(workspace.id);
  }, [workspace, lastId, setLast]);

  if (!workspace) return <Navigate to="/" replace />;
  return (
    <WorkspaceContext.Provider value={workspace}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
}
