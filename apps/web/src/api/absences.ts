import { absenceSchema, type CreateAbsence, type UpdateAbsence } from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

/** Absences show in member lists, pickers, standup groups and Workload: refetch them all. */
export function refreshAfterAbsences(queryClient: QueryClient, workspaceId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.absencesOf(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.standupGroups(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: ['standup-groups'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reportsOf(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
  ]);
}

/** Someone's current and upcoming out-of-office periods, by start date. */
export function useAbsences(workspaceId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.absences(workspaceId ?? '', userId ?? ''),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/members/${userId ?? ''}/absences`,
        z.array(absenceSchema),
      ),
    enabled: Boolean(workspaceId && userId),
  });
}

export function useCreateAbsence(workspaceId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: CreateAbsence) =>
      apiSend(`/workspaces/${workspaceId}/members/${userId}/absences`, absenceSchema, 'POST', body),
    onSettled: () => refreshAfterAbsences(queryClient, workspaceId),
  });
}

export function useUpdateAbsence(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: ({ id, ...patch }: UpdateAbsence & { id: string }) =>
      apiSend(`/workspaces/${workspaceId}/absences/${id}`, absenceSchema, 'PATCH', patch),
    onSettled: () => refreshAfterAbsences(queryClient, workspaceId),
  });
}

export function useDeleteAbsence(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend(`/workspaces/${workspaceId}/absences/${id}`, z.null(), 'DELETE'),
    onSettled: () => refreshAfterAbsences(queryClient, workspaceId),
  });
}
