import { tagSchema, type CreateTag, type Tag } from '@kite/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';

/** Workspace tags, by name (tag picker, filter menu). */
export function useTags(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tags(workspaceId ?? ''),
    queryFn: () => apiFetch(`/workspaces/${workspaceId ?? ''}/tags`, z.array(tagSchema)),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}

/** A tag made from the tag picker ("Create tag “…”"); it joins the cached list right away. */
export function useCreateTag(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    // The picker reports errors itself (a taken name just picks the existing tag).
    meta: { errorToast: false },
    mutationFn: (body: CreateTag) =>
      apiSend(`/workspaces/${workspaceId ?? ''}/tags`, tagSchema, 'POST', body),
    onSuccess: (tag) => {
      queryClient.setQueryData<Tag[]>(queryKeys.tags(workspaceId ?? ''), (tags = []) =>
        [...tags.filter((x) => x.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
  });
}
