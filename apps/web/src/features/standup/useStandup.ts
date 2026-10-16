import type { StandupGroup } from '@kite/shared';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';

/** Groups that meet today and are still waiting for my update (the nav dot). */
export const waitingForMe = (groups: readonly StandupGroup[] | undefined) =>
  (groups ?? []).filter((g) => g.isMember && g.meetsToday && !g.myPosted);

/** The caller's role in the current workspace. */
export function useWorkspaceRole() {
  const { me } = useAuth();
  const workspace = useCurrentWorkspace();
  return me?.workspaces.find((w) => w.id === workspace?.id)?.role;
}
