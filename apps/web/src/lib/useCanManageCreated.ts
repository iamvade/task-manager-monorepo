import { canManageCreated } from '@kite/shared';
import { useCurrentWorkspace } from '../api/workspaces';
import { useAuth } from '../auth/useAuth';

/**
 * Whether the viewer may archive / restore this project or delete this (empty) space: admins and
 * owners always, members when they created it (the API checks the same rule).
 */
export function useCanManageCreated(createdById: string | null | undefined): boolean {
  const role = useCurrentWorkspace()?.role;
  const { me } = useAuth();
  return (
    role !== undefined && me != null && canManageCreated(role, createdById ?? null, me.user.id)
  );
}
