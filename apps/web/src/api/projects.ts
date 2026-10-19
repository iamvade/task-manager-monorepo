import {
  applyTemplateResponseSchema,
  archivedProjectSchema,
  projectDetailSchema,
  type CreateProject,
  type ProjectDetail,
  type TemplateId,
  type UpdateProject,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: () => apiFetch(`/projects/${projectId ?? ''}`, projectDetailSchema),
    enabled: Boolean(projectId),
    // A 404 (no access / no such project) won't fix itself.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** Sidebar "+" on a space: a project with the server's key, color and default statuses. */
export function useCreateProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The new-project popover shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: CreateProject) =>
      apiSend(`/workspaces/${workspaceId}/projects`, projectDetailSchema, 'POST', body),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.project(detail.id), detail);
      return queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) });
    },
  });
}

/** Settings → Archived: the workspace's archived projects, most recent first. */
export function useArchivedProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.archivedProjects(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/archived-projects`,
        z.array(archivedProjectSchema),
      ),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Archive / restore (admins and owners). Archived projects leave the sidebar, search, My Tasks
 * and reports, so those refetch.
 */
export function useSetArchived(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, archived }: { projectId: string; archived: boolean }) =>
      apiSend(
        `/projects/${projectId}/${archived ? 'archive' : 'unarchive'}`,
        projectDetailSchema,
        'POST',
      ),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.project(detail.id), detail);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.archivedProjects(workspaceId) }),
        // My Tasks, space-level lists and reports all sit under `tasks`.
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
      ]);
    },
  });
}

/** Favorite on/off, optimistic on the project header; the sidebar favorites list is refetched. */
export function useToggleFavorite(project: Pick<ProjectDetail, 'id' | 'workspaceId'>) {
  const queryClient = useQueryClient();
  const key = queryKeys.project(project.id);
  return useMutation({
    mutationFn: (favorite: boolean) =>
      apiSend(`/projects/${project.id}/favorite`, z.null(), favorite ? 'PUT' : 'DELETE'),
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectDetail>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, isFavorite: favorite });
      return { previous };
    },
    onError: (_err, _favorite, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(project.workspaceId) });
    },
  });
}

/** Empty project → template tasks (`POST /projects/:id/from-template`). */
export function useApplyTemplate(project: Pick<ProjectDetail, 'id' | 'workspaceId'>) {
  const queryClient = useQueryClient();
  return useMutation({
    // The template cards show errors inline.
    meta: { errorToast: false },
    mutationFn: (templateId: TemplateId) =>
      apiSend(`/projects/${project.id}/from-template`, applyTemplateResponseSchema, 'POST', {
        templateId,
      }),
    onSuccess: ({ project: detail }) => {
      queryClient.setQueryData(queryKeys.project(project.id), detail);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(project.workspaceId) });
    },
  });
}

/** `PATCH /projects/:id` (brief, lead); the cached detail takes the server's copy. */
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProject) =>
      apiSend(`/projects/${projectId}`, projectDetailSchema, 'PATCH', patch),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.project(detail.id), detail);
    },
  });
}
