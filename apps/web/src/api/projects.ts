import {
  applyTemplateResponseSchema,
  projectDetailSchema,
  sprintSchema,
  type ProjectDetail,
  type TemplateId,
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

export function useSprints(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sprints(projectId ?? ''),
    queryFn: () => apiFetch(`/projects/${projectId ?? ''}/sprints`, z.array(sprintSchema)),
    enabled: Boolean(projectId),
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
