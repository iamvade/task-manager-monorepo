import {
  sprintSchema,
  sprintWithUsageSchema,
  type CreateSprint,
  type SprintWithUsage,
  type UpdateSprint,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

const byStart = (a: SprintWithUsage, b: SprintWithUsage) =>
  a.startDate === b.startDate ? a.number - b.number : a.startDate < b.startDate ? -1 : 1;

/**
 * The workspace's sprints by start date, each with its projects and live task count (pickers,
 * filters, Settings → Sprints).
 */
export function useSprints(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sprints(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(`/workspaces/${workspaceId ?? ''}/sprints`, z.array(sprintWithUsageSchema)),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

/** The sprints covering a project (or any of `projectIds`), by start date. */
export function useProjectSprints(
  workspaceId: string | undefined,
  projectIds: string | readonly string[] | undefined,
) {
  const ids = typeof projectIds === 'string' ? [projectIds] : (projectIds ?? []);
  const query = useSprints(workspaceId);
  const data = query.data?.filter((s) => s.projectIds.some((id) => ids.includes(id)));
  return { ...query, data };
}

/**
 * After a sprint changed: the sprint list, the projects' active sprint, the task details and
 * lists that show it, and the reports.
 */
export function refreshAfterSprintChange(queryClient: QueryClient, workspaceId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetails });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reportsOf(workspaceId) });
}

/** New sprint (Settings → Sprints, project menu, sprint picker): the workspace's next number. */
export function useCreateSprint(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    // The sprint form shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: CreateSprint) =>
      apiSend(`/workspaces/${workspaceId ?? ''}/sprints`, sprintSchema, 'POST', body),
    onSuccess: (sprint) => {
      queryClient.setQueryData<SprintWithUsage[]>(
        queryKeys.sprints(workspaceId ?? ''),
        (sprints) => sprints && [...sprints, { ...sprint, taskCount: 0 }].sort(byStart),
      );
      refreshAfterSprintChange(queryClient, workspaceId ?? '');
    },
  });
}

/** Edit a sprint's name, dates or projects (admins and its creator). */
export function useUpdateSprint(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The sprint form shows errors inline.
    meta: { errorToast: false },
    mutationFn: ({ sprintId, ...patch }: UpdateSprint & { sprintId: string }) =>
      apiSend(`/sprints/${sprintId}`, sprintSchema, 'PATCH', patch),
    onSuccess: (sprint) => {
      queryClient.setQueryData<SprintWithUsage[]>(queryKeys.sprints(workspaceId), (sprints) =>
        sprints?.map((s) => (s.id === sprint.id ? { ...s, ...sprint } : s)).sort(byStart),
      );
      refreshAfterSprintChange(queryClient, workspaceId);
    },
  });
}

/** Delete a sprint no task has been in (admins and its creator). */
export function useDeleteSprint(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sprintId: string) => apiSend(`/sprints/${sprintId}`, z.null(), 'DELETE'),
    onSuccess: (_data, sprintId) => {
      queryClient.setQueryData<SprintWithUsage[]>(queryKeys.sprints(workspaceId), (sprints) =>
        sprints?.filter((s) => s.id !== sprintId),
      );
    },
    onSettled: () => {
      refreshAfterSprintChange(queryClient, workspaceId);
    },
  });
}
