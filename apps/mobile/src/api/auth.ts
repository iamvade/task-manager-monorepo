import {
  authResultSchema,
  invitePreviewSchema,
  meResponseSchema,
  type AcceptInvite,
  type AuthResult,
  type LoginRequest,
  type MeResponse,
} from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { z } from 'zod';
import { signOut } from '../auth/signOut';
import { ApiError, apiFetch, apiSend } from './client';
import { currentToken, saveSession } from './session';

/** The signed-in user, or `null` without a session (no request is made then). */
async function fetchMe(): Promise<MeResponse | null> {
  if (!currentToken()) return null;
  try {
    return await apiFetch('/auth/me', meResponseSchema);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** How this app asks for its session: the token in the body, labeled with the phone's name. */
const appSession = () => ({
  client: 'mobile' as const,
  ...(Constants.deviceName && { deviceName: Constants.deviceName.slice(0, 80) }),
});

/** Keeps a new session's token, then the user (the routes leave sign-in). */
async function signedIn(queryClient: QueryClient, result: AuthResult) {
  if (result.session) await saveSession(result.session);
  const { session: _session, ...me } = result;
  queryClient.setQueryData<MeResponse>(queryKeys.me, me);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<LoginRequest, 'email' | 'password'>) =>
      apiSend('/auth/login', authResultSchema, 'POST', { ...body, ...appSession() }),
    onSuccess: (result) => signedIn(queryClient, result),
  });
}

/** Ends the session on the server (best effort: offline still signs out here). */
export function useLogout() {
  return useMutation({
    networkMode: 'always',
    mutationFn: () => apiSend('/auth/logout', z.null(), 'POST').catch(() => null),
    onSettled: () => signOut(),
  });
}

export const inviteQueryKey = (token: string) => ['invite', token] as const;

export function useInvite(token: string) {
  return useQuery({
    queryKey: inviteQueryKey(token),
    queryFn: () => apiFetch(`/invites/${encodeURIComponent(token)}`, invitePreviewSchema),
    retry: false,
  });
}

/**
 * A new account comes back signed in (its `session` replaces any current one); an existing
 * account joins with its bearer session (signed in first) and gets no new one.
 */
export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<AcceptInvite, 'name' | 'password'>) =>
      // Always as the app: a new account's session must come back as a token, never a cookie.
      apiSend(`/invites/${encodeURIComponent(token)}/accept`, authResultSchema, 'POST', {
        ...body,
        ...appSession(),
      }),
    // The preview stays cached: the screen moves into the workspace it names.
    onSuccess: (result) => signedIn(queryClient, result),
  });
}
