import {
  invitePreviewSchema,
  meResponseSchema,
  passwordResetPreviewSchema,
  type AcceptInvite,
  type LoginRequest,
  type MeResponse,
  type PasswordResetPreview,
  type UpdateMe,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend } from './client';
import { queryKeys } from '@kite/shared/client';

export const meQueryKey = queryKeys.me;

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
    // The login form shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: LoginRequest) => apiSend('/auth/login', meResponseSchema, 'POST', body),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    // Signing out always succeeds locally; no error toast.
    meta: { errorToast: false },
    mutationFn: () => apiSend('/auth/logout', z.null(), 'POST'),
    // Even if the server call fails the local state should forget the user. Not `clear()`: it
    // drops the `me` query under its observers, so the app would keep showing the user until a
    // reload. Set `me` first (the guards send the page to sign-in), then forget the rest.
    onSettled: () => {
      void queryClient.cancelQueries();
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
      queryClient.getMutationCache().clear();
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
    // The accept page shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: AcceptInvite) =>
      apiSend(`/invites/${encodeURIComponent(token)}/accept`, meResponseSchema, 'POST', body),
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryKey, me);
      queryClient.removeQueries({ queryKey: ['invite', token] });
    },
  });
}

export function usePasswordReset(token: string) {
  return useQuery({
    queryKey: ['password-reset', token],
    queryFn: () =>
      apiFetch(`/password-resets/${encodeURIComponent(token)}`, passwordResetPreviewSchema),
    retry: false,
  });
}

/**
 * Sets a new password with a reset link. The person is signed out everywhere, so when this
 * browser was signed in as them, forget them here too (like logout).
 */
export function useResetPassword(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The reset page shows errors inline.
    meta: { errorToast: false },
    mutationFn: (password: string) =>
      apiSend(`/password-resets/${encodeURIComponent(token)}`, z.null(), 'POST', { password }),
    onSuccess: () => {
      const email = queryClient.getQueryData<MeResponse | null>(meQueryKey)?.user.email;
      const reset = queryClient.getQueryData<PasswordResetPreview>(['password-reset', token]);
      if (email && email.toLowerCase() === reset?.email.toLowerCase()) {
        void queryClient.cancelQueries();
        queryClient.setQueryData(meQueryKey, null);
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
      }
    },
  });
}
