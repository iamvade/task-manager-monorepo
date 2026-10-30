import { canManageStructure } from '@kite/shared';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useIsNarrow } from '../../lib/useMediaQuery';
import { useUiStore } from '../../stores/ui';

/**
 * "Rename" in a project or space header (admins): opens the sidebar row's rename field, expanding
 * the sidebar and the space first. Null when not allowed, and on phones (the sidebar is a sheet).
 */
export function useStartRename(): ((id: string, spaceId: string) => void) | null {
  const workspace = useCurrentWorkspace();
  const narrow = useIsNarrow();
  if (!workspace || !canManageStructure(workspace.role) || narrow) return null;
  return (id, spaceId) => {
    const ui = useUiStore.getState();
    if (ui.sidebarCollapsed) ui.toggleSidebar();
    ui.setSpaceOpen(spaceId, true);
    ui.setRenaming(id);
  };
}
