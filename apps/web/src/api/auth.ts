import {
  invitePreviewSchema,
  meResponseSchema,
  type AcceptInvite,
  type LoginRequest,
  type MeResponse,
  type UpdateMe,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend } from './client';

export const meQueryKey = ['me'] as const;

/** The signed-in user, or `null` when there is no session. */
async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch('/auth/me', meResponseSchema);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, retry: false, staleTime: 5 * 60_000 });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => apiSend('/auth/login', meResponseSchema, 'POST', body),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('/auth/logout', z.null(), 'POST'),
    // Even if the server call fails the local state should forget the user.
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMe) => apiSend('/me', meResponseSchema, 'PATCH', body),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

export function useInvite(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () => apiFetch(`/invites/${encodeURIComponent(token)}`, invitePreviewSchema),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptInvite) =>
      apiSend(`/invites/${encodeURIComponent(token)}/accept`, meResponseSchema, 'POST', body),
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryKey, me);
      queryClient.removeQueries({ queryKey: ['invite', token] });
    },
  });
}
