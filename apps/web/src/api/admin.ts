import {
  adminUserSchema,
  adminWorkspaceSchema,
  createdOwnerInviteSchema,
  createdPasswordResetSchema,
  createdWorkspaceSchema,
  type CreateWorkspace,
} from '@kite/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { apiFetch, apiSend, toQuery } from './client';
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

const USER_SEARCH_DELAY_MS = 250;

/**
 * Platform admin: accounts whose name or email contains `query` (everyone when empty). Waits for
 * a pause in typing and keeps the previous results on screen while the next ones load.
 */
export function useAdminUsers(query: string) {
  const q = query.trim().slice(0, 100);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(q);
    }, USER_SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  return useQuery({
    queryKey: queryKeys.adminUsers(debounced),
    queryFn: () =>
      apiFetch(`/admin/users${toQuery({ q: debounced || undefined })}`, z.array(adminUserSchema)),
    placeholderData: keepPreviousData,
  });
}

/** A one-time password reset link for the person; their earlier unused link stops working. */
export function useCreatePasswordReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiSend(`/admin/users/${userId}/password-reset`, createdPasswordResetSchema, 'POST'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}
