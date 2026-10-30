import {
  projectDetailSchema,
  spaceSchema,
  type CreateSpace,
  type SidebarResponse,
} from '@kite/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from './client';
import { queryKeys } from '@kite/shared/client';
import { withProjectMoved, withRenamed, withSpaceMoved, type Neighbors } from './sidebarOrder';

export function useCreateSpace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The new-space popover shows errors inline.
    meta: { errorToast: false },
    mutationFn: (body: CreateSpace) =>
      apiSend(`/workspaces/${workspaceId}/spaces`, spaceSchema, 'POST', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) }),
  });
}

/** Admins and owners; the server answers 409 `SPACE_NOT_EMPTY` while it still has projects. */
export function useDeleteSpace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => apiSend(`/spaces/${spaceId}`, z.null(), 'DELETE'),
    // Not awaited: the caller leaves the space's page before the sidebar drops it (no 404 flash).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) });
    },
  });
}

/** Optimistic edit of the cached sidebar, rolled back if the server says no. */
function useSidebarMutation<V>(
  workspaceId: string,
  send: (vars: V) => Promise<unknown>,
  edit: (data: SidebarResponse, vars: V) => SidebarResponse,
) {
  const queryClient = useQueryClient();
  const key = queryKeys.sidebar(workspaceId);
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SidebarResponse>(key);
      if (previous) queryClient.setQueryData(key, edit(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Admins and owners: `PATCH /spaces/:id` (name). */
export function useRenameSpace(workspaceId: string) {
  return useSidebarMutation(
    workspaceId,
    ({ spaceId, name }: { spaceId: string; name: string }) =>
      apiSend(`/spaces/${spaceId}`, spaceSchema, 'PATCH', { name }),
    (data, { spaceId, name }) => withRenamed(data, spaceId, name),
  );
}

/** Admins and owners: `POST /spaces/:id/move` with the neighbors after the drop. */
export function useMoveSpace(workspaceId: string) {
  return useSidebarMutation(
    workspaceId,
    ({ spaceId, ...neighbors }: { spaceId: string } & Neighbors) =>
      apiSend(`/spaces/${spaceId}/move`, spaceSchema, 'POST', neighbors),
    (data, { spaceId, ...neighbors }) => withSpaceMoved(data, spaceId, neighbors),
  );
}

/** Admins and owners: rename a project (`PATCH /projects/:id`); its header follows. */
export function useRenameProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useSidebarMutation(
    workspaceId,
    async ({ projectId, name }: { projectId: string; name: string }) => {
      const detail = await apiSend(`/projects/${projectId}`, projectDetailSchema, 'PATCH', {
        name,
      });
      queryClient.setQueryData(queryKeys.project(detail.id), detail);
    },
    (data, { projectId, name }) => withRenamed(data, projectId, name),
  );
}

/** Admins and owners: `POST /projects/:id/move`, within its space or into `spaceId`. */
export function useMoveProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useSidebarMutation(
    workspaceId,
    async ({
      projectId,
      spaceId,
      ...neighbors
    }: { projectId: string; spaceId: string } & Neighbors) => {
      const detail = await apiSend(`/projects/${projectId}/move`, projectDetailSchema, 'POST', {
        spaceId,
        ...neighbors,
      });
      queryClient.setQueryData(queryKeys.project(detail.id), detail);
    },
    (data, { projectId, spaceId, ...neighbors }) =>
      withProjectMoved(data, projectId, spaceId, neighbors),
  );
}
