import { spaceSchema, type CreateSpace } from '@kite/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiSend } from './client';
import { queryKeys } from './queryKeys';

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
