import { spaceSchema, type CreateSpace } from '@kite/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from './client';
import { queryKeys } from '@kite/shared/client';

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
