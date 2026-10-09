import { sidebarResponseSchema, workspaceMemberSchema } from '@kite/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../auth/useAuth';
import { useUiStore } from '../stores/ui';
import { apiFetch } from './client';
import { queryKeys } from './queryKeys';

/** The workspace the app is showing: the last one used if still a member, else the first. */
export function useCurrentWorkspace() {
  const { me } = useAuth();
  const lastId = useUiStore((s) => s.lastWorkspaceId);
  const workspaces = me?.workspaces ?? [];
  return workspaces.find((w) => w.id === lastId) ?? workspaces[0];
}

export function useSidebar(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sidebar(workspaceId ?? ''),
    queryFn: () => apiFetch(`/workspaces/${workspaceId ?? ''}/sidebar`, sidebarResponseSchema),
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(`/workspaces/${workspaceId ?? ''}/members`, z.array(workspaceMemberSchema)),
    enabled: Boolean(workspaceId),
  });
}
