import {
  oauthAuthorizeCheckSchema,
  oauthAuthorizeResultSchema,
  oauthGrantsSchema,
  type OAuthAuthorizeParams,
  type OAuthAuthorizeRequest,
  type OAuthGrants,
} from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend } from './client';

/**
 * The remote Claude connector (Settings → Claude): its address and my sign-ins through it, or
 * `null` when this server has no connector (the routes don't exist there).
 */
export function useConnector() {
  return useQuery({
    queryKey: queryKeys.oauthGrants,
    queryFn: async (): Promise<OAuthGrants | null> => {
      try {
        return await apiFetch('/oauth/grants', oauthGrantsSchema);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    meta: { errorToast: false },
  });
}

/** Ends a connector sign-in: Claude has to sign in again. */
export function useRevokeGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/oauth/grants/${id}`, z.null(), 'DELETE'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauthGrants }),
  });
}

/** Who is asking for access (the consent page); an error means the request can't be granted. */
export function useAuthorizeCheck(params: OAuthAuthorizeParams | null) {
  return useQuery({
    queryKey: queryKeys.oauthAuthorizeCheck(params),
    queryFn: () =>
      apiSend('/oauth/authorize/check', oauthAuthorizeCheckSchema, 'POST', params ?? undefined),
    enabled: params !== null,
    retry: false,
    staleTime: Infinity,
    meta: { errorToast: false },
  });
}

/** Allow or refuse: answers the address to send the browser back to. */
export function useAuthorize() {
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: OAuthAuthorizeRequest) =>
      apiSend('/oauth/authorize', oauthAuthorizeResultSchema, 'POST', body),
  });
}
