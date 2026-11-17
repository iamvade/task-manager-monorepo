import {
  personalIndexSchema,
  personalItemSchema,
  personalItemSummarySchema,
  personalTopicSchema,
  type CreatePersonalItem,
  type CreatePersonalTopic,
  type Move,
  type PersonalIndex,
  type PersonalItem,
  type PersonalItemSummary,
  type UpdatePersonalItem,
  type UpdatePersonalTopic,
} from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend } from './client';

/** My personal space without bodies: topics, items, links and the team tasks they point to. */
export function usePersonalIndex(enabled = true) {
  return useQuery({
    queryKey: queryKeys.personalIndex,
    queryFn: () => apiFetch('/me/personal', personalIndexSchema),
    staleTime: 30_000,
    enabled,
  });
}

/** One note or to-do with its body and backlinks. */
export function usePersonalItem(itemId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.personalItem(itemId ?? ''),
    queryFn: () => apiFetch(`/me/personal/items/${itemId ?? ''}`, personalItemSchema),
    enabled: Boolean(itemId),
    // A deleted or someone else's item is a 404: show "Not found" at once.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
    staleTime: 30_000,
  });
}

const refreshAll = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.personal });

/** Puts a saved item into the caches (its detail and its row in the index). */
function writeItem(queryClient: QueryClient, item: PersonalItem) {
  queryClient.setQueryData(queryKeys.personalItem(item.id), item);
  queryClient.setQueryData<PersonalIndex>(queryKeys.personalIndex, (idx) => {
    if (!idx) return idx;
    const summary = personalItemSummarySchema.parse(item);
    const exists = idx.items.some((i) => i.id === item.id);
    return {
      ...idx,
      items: exists
        ? idx.items.map((i) => (i.id === item.id ? summary : i))
        : [summary, ...idx.items],
    };
  });
}

/** Optimistically patches an item's index row; returns the previous index for rollback. */
async function patchIndexRow(
  queryClient: QueryClient,
  itemId: string,
  patch: (row: PersonalItemSummary) => PersonalItemSummary,
) {
  await queryClient.cancelQueries({ queryKey: queryKeys.personalIndex });
  const previous = queryClient.getQueryData<PersonalIndex>(queryKeys.personalIndex);
  if (previous) {
    queryClient.setQueryData<PersonalIndex>(queryKeys.personalIndex, {
      ...previous,
      items: previous.items.map((i) => (i.id === itemId ? patch(i) : i)),
    });
  }
  return previous;
}

export function useCreatePersonalTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: (body: CreatePersonalTopic) =>
      apiSend('/me/personal/topics', personalTopicSchema, 'POST', body),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useUpdatePersonalTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorToast: false },
    mutationFn: ({ topicId, ...patch }: UpdatePersonalTopic & { topicId: string }) =>
      apiSend(`/me/personal/topics/${topicId}`, personalTopicSchema, 'PATCH', patch),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useMovePersonalTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, ...move }: Partial<Move> & { topicId: string }) =>
      apiSend(`/me/personal/topics/${topicId}/move`, personalTopicSchema, 'POST', move),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useDeletePersonalTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => apiSend(`/me/personal/topics/${topicId}`, z.null(), 'DELETE'),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useCreatePersonalItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonalItem) =>
      apiSend('/me/personal/items', personalItemSchema, 'POST', body),
    onSuccess: (item) => {
      writeItem(queryClient, item);
    },
    onSettled: () => refreshAll(queryClient),
  });
}

/**
 * Edits an item. Fields shown in lists (title, done, topic, kind, due) change in the index right
 * away and roll back on error; the body is saved by the editor's autosave.
 */
export function useUpdatePersonalItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...patch }: UpdatePersonalItem & { itemId: string }) =>
      apiSend(`/me/personal/items/${itemId}`, personalItemSchema, 'PATCH', patch),
    onMutate: async ({ itemId, done, body: _body, ...fields }) => {
      const previous = await patchIndexRow(queryClient, itemId, (row) => ({
        ...row,
        ...fields,
        ...(done === undefined ? {} : { doneAt: done ? new Date().toISOString() : null }),
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.personalIndex, context.previous);
    },
    onSuccess: (item) => {
      writeItem(queryClient, item);
    },
    // Links and backlinks of other items may have changed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.personalIndex }),
  });
}

export function useMovePersonalItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...move }: Partial<Move> & { itemId: string }) =>
      apiSend(`/me/personal/items/${itemId}/move`, personalItemSummarySchema, 'POST', move),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useDeletePersonalItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiSend(`/me/personal/items/${itemId}`, z.null(), 'DELETE'),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personalIndex });
      const previous = queryClient.getQueryData<PersonalIndex>(queryKeys.personalIndex);
      if (previous) {
        queryClient.setQueryData<PersonalIndex>(queryKeys.personalIndex, {
          ...previous,
          items: previous.items.filter((i) => i.id !== itemId),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.personalIndex, context.previous);
    },
    onSettled: () => refreshAll(queryClient),
  });
}

export function useRestorePersonalItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiSend(`/me/personal/items/${itemId}/restore`, personalItemSchema, 'POST'),
    onSuccess: (item) => {
      writeItem(queryClient, item);
    },
    onSettled: () => refreshAll(queryClient),
  });
}
