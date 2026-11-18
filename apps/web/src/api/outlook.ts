import {
  outlookBusySchema,
  outlookConnectionSchema,
  outlookEventsSchema,
  type OutlookConnection,
} from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';

/** My Outlook link: connected, its host, the last fetch (never the link itself). */
export function useOutlookConnection() {
  return useQuery({
    queryKey: queryKeys.outlookConnection,
    queryFn: () => apiFetch('/me/outlook-calendar', outlookConnectionSchema),
    staleTime: 60_000,
  });
}

/** My events between two dates (inclusive); the server refetches Outlook every 10 minutes. */
export function useOutlookEvents(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.outlookEvents(from, to),
    queryFn: () =>
      apiFetch(`/me/outlook-calendar/events?from=${from}&to=${to}`, outlookEventsSchema),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** A teammate's busy blocks (no titles) in this workspace. */
export function useOutlookBusy(
  workspaceId: string | undefined,
  userId: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: queryKeys.outlookBusy(workspaceId ?? '', userId ?? '', from, to),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/members/${userId ?? ''}/outlook-busy?from=${from}&to=${to}`,
        outlookBusySchema,
      ),
    enabled: Boolean(workspaceId && userId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Saves (or replaces) my published-calendar link; the server fetches it first. */
export function useConnectOutlook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiSend('/me/outlook-calendar', outlookConnectionSchema, 'PUT', { url }),
    // The form shows why the link was refused.
    meta: { errorToast: false },
    onSuccess: (connection: OutlookConnection) => {
      queryClient.setQueryData(queryKeys.outlookConnection, connection);
      void queryClient.invalidateQueries({ queryKey: queryKeys.outlook });
    },
  });
}

export function useDisconnectOutlook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('/me/outlook-calendar', z.null(), 'DELETE'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.outlook }),
  });
}

/** Fetches Outlook again now (`refresh=true`) and shows the result. */
export function useRefreshOutlook(from: string, to: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(
        `/me/outlook-calendar/events?from=${from}&to=${to}&refresh=true`,
        outlookEventsSchema,
      ),
    onSuccess: (events) => {
      queryClient.setQueryData(queryKeys.outlookEvents(from, to), events);
      void queryClient.invalidateQueries({ queryKey: queryKeys.outlook });
    },
  });
}
