import {
  standupGroupSchema,
  type CreateStandupGroup,
  type StandupGroup,
  type UpdateStandupGroup,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

/** Every non-archived standup group of the workspace (the sidebar shows the caller's). */
export function useStandupGroups(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.standupGroups(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(`/workspaces/${workspaceId ?? ''}/standup-groups`, z.array(standupGroupSchema)),
    enabled: Boolean(workspaceId),
  });
}

export function useStandupGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.standupGroup(groupId ?? ''),
    queryFn: () => apiFetch(`/standup-groups/${groupId ?? ''}`, standupGroupSchema),
    enabled: Boolean(groupId),
  });
}

/** Puts a group's new state into both caches and refetches the list. */
function settle(queryClient: QueryClient, group: StandupGroup) {
  queryClient.setQueryData(queryKeys.standupGroup(group.id), group);
  return queryClient.invalidateQueries({ queryKey: queryKeys.standupGroups(group.workspaceId) });
}

export function useCreateStandupGroup(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStandupGroup) =>
      apiSend(`/workspaces/${workspaceId}/standup-groups`, standupGroupSchema, 'POST', body),
    onSuccess: (group) => settle(queryClient, group),
  });
}

/** The settings page's Save (settings + the ordered member list in one request). */
export function useUpdateStandupGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (patch: UpdateStandupGroup) =>
      apiSend(`/standup-groups/${groupId}`, standupGroupSchema, 'PATCH', patch),
    onSuccess: (group) => settle(queryClient, group),
  });
}

export function useArchiveStandupGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, archived }: { groupId: string; archived: boolean }) =>
      apiSend(
        `/standup-groups/${groupId}/${archived ? 'archive' : 'restore'}`,
        standupGroupSchema,
        'POST',
      ),
    onSuccess: (group) => settle(queryClient, group),
  });
}
