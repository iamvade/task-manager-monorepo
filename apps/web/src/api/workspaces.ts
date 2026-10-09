import {
  inviteSchema,
  sidebarResponseSchema,
  workspaceMemberSchema,
  type CreateInvite,
  type UpdateMemberRole,
  type WorkspaceMember,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../auth/useAuth';
import { useUiStore } from '../stores/ui';
import { apiFetch, apiSend } from './client';
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

/** Admin/owner: switch another member between admin and member. */
export function useUpdateMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.members(workspaceId);
  return useMutation({
    mutationFn: ({ userId, role }: UpdateMemberRole & { userId: string }) =>
      apiSend(`/workspaces/${workspaceId}/members/${userId}`, workspaceMemberSchema, 'PATCH', {
        role,
      }),
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WorkspaceMember[]>(key);
      queryClient.setQueryData<WorkspaceMember[]>(key, (members) =>
        members?.map((m) => (m.user.id === userId ? { ...m, role } : m)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Pending invites (admins only). */
export function useInvites(workspaceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invites(workspaceId ?? ''),
    queryFn: () => apiFetch(`/workspaces/${workspaceId ?? ''}/invites`, z.array(inviteSchema)),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useCreateInvite(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvite) =>
      apiSend(`/workspaces/${workspaceId}/invites`, inviteSchema, 'POST', body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites(workspaceId) }),
  });
}

export function useRevokeInvite(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.invites(workspaceId);
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiSend(`/workspaces/${workspaceId}/invites/${inviteId}`, z.null(), 'DELETE'),
    onMutate: async (inviteId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<z.infer<typeof inviteSchema>[]>(key);
      queryClient.setQueryData(
        key,
        previous?.filter((i) => i.id !== inviteId),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
