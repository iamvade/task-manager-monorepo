import {
  adminWorkspaceSchema,
  createdOwnerInviteSchema,
  createdWorkspaceSchema,
  type CreateWorkspace,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

/** Platform admin: every workspace with its owner or pending owner invite. */
export function useAdminWorkspaces() {
  return useQuery({
    queryKey: queryKeys.adminWorkspaces,
    queryFn: () => apiFetch('/admin/workspaces', z.array(adminWorkspaceSchema)),
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    // The form shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: CreateWorkspace) =>
      apiSend('/admin/workspaces', createdWorkspaceSchema, 'POST', body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminWorkspaces }),
  });
}

/** A new owner link; the earlier one stops working. */
export function useReissueOwnerInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, email }: { workspaceId: string; email: string }) =>
      apiSend(`/admin/workspaces/${workspaceId}/owner-invite`, createdOwnerInviteSchema, 'POST', {
        email,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminWorkspaces }),
  });
}
