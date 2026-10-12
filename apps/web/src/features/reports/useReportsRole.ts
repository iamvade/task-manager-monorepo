import { useCurrentWorkspace } from '../../api/workspaces';

/** Admins and owners get the People tab; members get My performance. */
export function useReportsRole() {
  const workspace = useCurrentWorkspace();
  return { workspace, isAdmin: workspace !== undefined && workspace.role !== 'member' };
}
