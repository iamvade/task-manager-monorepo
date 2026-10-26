import {
  tagSchema,
  tagWithUsageSchema,
  type CreateTag,
  type TagWithUsage,
  type UpdateTag,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from '@kite/shared/client';

const byName = (a: TagWithUsage, b: TagWithUsage) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Workspace tags by name, each with its live task count (tag picker, filters, Settings → Tags). */
export function useTags(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tags(workspaceId ?? ''),
    queryFn: () => apiFetch(`/workspaces/${workspaceId ?? ''}/tags`, z.array(tagWithUsageSchema)),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}

/**
 * After a tag changed: the tag list, plus the task lists, details and My Tasks that show its
 * chips (a rename or recolor, a merge or delete takes it off tasks).
 */
export function refreshAfterTagChange(queryClient: QueryClient, workspaceId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tags(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetails });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
}

/** A new tag (admins: Settings → Tags, tag picker); it joins the cached list right away. */
export function useCreateTag(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    // Callers report errors themselves (a taken name picks or names the existing tag).
    meta: { errorToast: false },
    mutationFn: (body: CreateTag) =>
      apiSend(`/workspaces/${workspaceId ?? ''}/tags`, tagSchema, 'POST', body),
    onSuccess: (tag) => {
      queryClient.setQueryData<TagWithUsage[]>(queryKeys.tags(workspaceId ?? ''), (tags = []) =>
        [...tags.filter((x) => x.id !== tag.id), { ...tag, taskCount: 0 }].sort(byName),
      );
    },
  });
}

/** Rename or recolor (admins); optimistic, rolled back on error. */
export function useUpdateTag(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.tags(workspaceId);
  return useMutation({
    // A taken name is shown next to the field.
    meta: { errorToast: false },
    mutationFn: ({ tagId, ...patch }: UpdateTag & { tagId: string }) =>
      apiSend(`/tags/${tagId}`, tagSchema, 'PATCH', patch),
    onMutate: async ({ tagId, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TagWithUsage[]>(key);
      queryClient.setQueryData<TagWithUsage[]>(key, (tags) =>
        tags?.map((t) => (t.id === tagId ? { ...t, ...patch } : t)).sort(byName),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      refreshAfterTagChange(queryClient, workspaceId);
    },
  });
}

/** Merge a tag into another (admins): its tasks get the other tag, then it's deleted. */
export function useMergeTag(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, intoTagId }: { tagId: string; intoTagId: string }) =>
      apiSend(`/tags/${tagId}/merge`, tagWithUsageSchema, 'POST', { intoTagId }),
    onSuccess: (into, { tagId }) => {
      queryClient.setQueryData<TagWithUsage[]>(queryKeys.tags(workspaceId), (tags) =>
        tags?.filter((t) => t.id !== tagId).map((t) => (t.id === into.id ? into : t)),
      );
    },
    onSettled: () => {
      refreshAfterTagChange(queryClient, workspaceId);
    },
  });
}

/** Delete a tag (admins), taking it off every task. */
export function useDeleteTag(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => apiSend(`/tags/${tagId}`, z.null(), 'DELETE'),
    onSuccess: (_data, tagId) => {
      queryClient.setQueryData<TagWithUsage[]>(queryKeys.tags(workspaceId), (tags) =>
        tags?.filter((t) => t.id !== tagId),
      );
    },
    onSettled: () => {
      refreshAfterTagChange(queryClient, workspaceId);
    },
  });
}
