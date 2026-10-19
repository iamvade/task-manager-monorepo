import {
  FEEDBACK_UPLOAD_TOKEN_HEADER,
  apiErrorSchema,
  feedbackBatchResultSchema,
  feedbackCreateTaskResultSchema,
  feedbackDetailSchema,
  feedbackListResponseSchema,
  feedbackOptionsSchema,
  feedbackTaskSuggestionsSchema,
  publicFeedbackFormSchema,
  publicFeedbackResultSchema,
  publicFeedbackUploadSchema,
  type FeedbackBatch,
  type FeedbackCreateTask,
  type FeedbackDetail,
  type FeedbackListQuery,
  type FeedbackListResponse,
  type FeedbackStatus,
  type PublicFeedbackSubmit,
  type PublicFeedbackUpload,
  type SidebarResponse,
} from '@kite/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend, parseRetryAfter, toQuery } from './client';
import { queryKeys } from './queryKeys';

export type FeedbackListParams = Partial<Pick<FeedbackListQuery, 'q' | 'type' | 'status'>> & {
  offset?: number;
  limit?: number;
};

/** Download link of a feedback attachment (`inline` previews png/jpeg/gif/webp). */
export const feedbackAttachmentUrl = (
  feedbackId: string,
  attachmentId: string,
  { inline = false } = {},
) =>
  `/api/v1/feedback/${feedbackId}/attachments/${attachmentId}/download${inline ? '?inline=true' : ''}`;

/** The public form's address, as the inbox shares it. */
export const publicFeedbackUrl = (slug: string) => `${window.location.origin}/feedback/${slug}`;

export function useFeedbackList(workspaceId: string | undefined, params: FeedbackListParams) {
  return useQuery({
    queryKey: queryKeys.feedbackList(workspaceId ?? '', params),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/feedback${toQuery({ ...params })}`,
        feedbackListResponseSchema,
      ),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
}

/** One item by ref (`FB-1042`) or id: the detail panel. */
export function useFeedback(workspaceId: string | undefined, ref: string | null) {
  return useQuery({
    queryKey: queryKeys.feedbackItem(workspaceId ?? '', ref ?? ''),
    queryFn: () =>
      apiFetch(`/workspaces/${workspaceId ?? ''}/feedback/${ref ?? ''}`, feedbackDetailSchema),
    enabled: Boolean(workspaceId && ref),
  });
}

export function useFeedbackTaskSuggestions(feedbackId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.feedbackSuggestions(feedbackId ?? ''),
    queryFn: () =>
      apiFetch(`/feedback/${feedbackId ?? ''}/task-suggestions`, feedbackTaskSuggestionsSchema),
    enabled: Boolean(feedbackId) && enabled,
  });
}

/** Unlinked feedback a task can link ("+ Link feedback" in the drawer). */
export function useFeedbackOptions(taskId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.feedbackOptions(taskId, q),
    queryFn: () =>
      apiFetch(
        `/tasks/${taskId}/feedback-options${toQuery({ q: q.trim() || undefined })}`,
        feedbackOptionsSchema,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Refetch the inbox, the item panels, the sidebar count and (for links) the task drawers. */
export function settleFeedback(queryClient: QueryClient, workspaceId: string, tasks = false) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackOf(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) });
  if (tasks) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetails });
    void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackOptionsAll });
  }
}

/** Puts a fresh detail in the cache under both its ref and id. */
function storeDetail(queryClient: QueryClient, workspaceId: string, detail: FeedbackDetail) {
  queryClient.setQueryData(queryKeys.feedbackItem(workspaceId, detail.ref), detail);
  queryClient.setQueryData(queryKeys.feedbackItem(workspaceId, detail.id), detail);
}

/** Applies `patch` to the items wherever it's cached (lists and panels); returns an undo. */
async function patchItem(
  queryClient: QueryClient,
  workspaceId: string,
  ids: ReadonlySet<string>,
  patch: { status?: FeedbackStatus; isRead?: boolean },
) {
  const key = queryKeys.feedbackOf(workspaceId);
  await queryClient.cancelQueries({ queryKey: key });
  const snapshot = queryClient.getQueriesData({ queryKey: key });
  queryClient.setQueriesData<FeedbackListResponse | FeedbackDetail>({ queryKey: key }, (data) => {
    if (!data) return data;
    if ('items' in data) {
      return { ...data, items: data.items.map((i) => (ids.has(i.id) ? { ...i, ...patch } : i)) };
    }
    return ids.has(data.id) ? { ...data, ...patch } : data;
  });
  return () => {
    for (const [k, v] of snapshot) queryClient.setQueryData(k, v);
  };
}

/** Opening an item marks it read for the team (and drops it from the sidebar count). */
export function useMarkFeedbackRead(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: string; status: FeedbackStatus; isRead: boolean }) =>
      apiSend(`/feedback/${item.id}/read`, z.null(), 'POST'),
    onMutate: async (item) => {
      if (item.isRead) return;
      const undo = await patchItem(queryClient, workspaceId, new Set([item.id]), {
        isRead: true,
      });
      if (item.status === 'new') {
        queryClient.setQueryData<SidebarResponse>(queryKeys.sidebar(workspaceId), (s) =>
          s ? { ...s, feedbackUnreadCount: Math.max(0, s.feedbackUnreadCount - 1) } : s,
        );
      }
      return undo;
    },
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => {
      settleFeedback(queryClient, workspaceId);
    },
  });
}

export function useSetFeedbackStatus(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      apiSend(`/feedback/${id}`, feedbackDetailSchema, 'PATCH', { status }),
    onMutate: ({ id, status }) =>
      patchItem(queryClient, workspaceId, new Set([id]), { status, isRead: true }),
    onError: (_e, _v, undo) => undo?.(),
    onSuccess: (detail) => {
      storeDetail(queryClient, workspaceId, detail);
    },
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, true);
    },
  });
}

/** A mutation answered with the item's fresh detail. */
function useDetailMutation<V>(
  workspaceId: string,
  send: (vars: V) => Promise<FeedbackDetail>,
  tasks = true,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (detail) => {
      storeDetail(queryClient, workspaceId, detail);
    },
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, tasks);
    },
  });
}

export const useAddFeedbackNote = (workspaceId: string) =>
  useDetailMutation(
    workspaceId,
    ({ id, text }: { id: string; text: string }) =>
      apiSend(`/feedback/${id}/notes`, feedbackDetailSchema, 'POST', { text }),
    false,
  );

export const useLinkFeedback = (workspaceId: string) =>
  useDetailMutation(workspaceId, ({ id, taskId }: { id: string; taskId: string }) =>
    apiSend(`/feedback/${id}/link`, feedbackDetailSchema, 'PUT', { taskId }),
  );

export const useUnlinkFeedback = (workspaceId: string) =>
  useDetailMutation(workspaceId, ({ id }: { id: string }) =>
    apiSend(`/feedback/${id}/link`, feedbackDetailSchema, 'DELETE'),
  );

/** Replaces the linked task's assignees from the feedback panel. */
export function useSetFeedbackAssignees(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
      apiSend(`/feedback/${id}/assignees`, feedbackDetailSchema, 'PUT', { userIds }),
    onSuccess: (detail) => {
      storeDetail(queryClient, workspaceId, detail);
    },
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export function useCreateTaskFromFeedback(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: FeedbackCreateTask & { id: string }) =>
      apiSend(`/feedback/${id}/create-task`, feedbackCreateTaskResultSchema, 'POST', body),
    onSuccess: ({ feedback }) => {
      storeDetail(queryClient, workspaceId, feedback);
    },
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

/** Inbox multi-select and "Close all". */
export function useFeedbackBatch(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedbackBatch) =>
      apiSend(`/workspaces/${workspaceId}/feedback/batch`, feedbackBatchResultSchema, 'POST', body),
    onMutate: ({ ids, change }) =>
      change.action === 'status'
        ? patchItem(queryClient, workspaceId, new Set(ids), {
            status: change.status,
            isRead: true,
          })
        : undefined,
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, true);
    },
  });
}

/** Links a feedback item from the task drawer. */
export function useLinkFeedbackToTask(workspaceId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (feedbackId: string) =>
      apiSend(`/tasks/${taskId}/feedback/${feedbackId}`, z.null(), 'PUT'),
    onSettled: () => {
      settleFeedback(queryClient, workspaceId, true);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Public form (no session)

export function usePublicFeedbackForm(slug: string) {
  return useQuery({
    queryKey: queryKeys.publicFeedbackForm(slug),
    queryFn: () => apiFetch(`/public/feedback/${slug}`, publicFeedbackFormSchema),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

export const submitPublicFeedback = (slug: string, body: PublicFeedbackSubmit) =>
  apiSend(`/public/feedback/${slug}`, publicFeedbackResultSchema, 'POST', body);

/**
 * Uploads one file with progress (fetch can't report upload progress, so XHR). `signal` aborts
 * it ("Cancel upload"). Rejects with `ApiError` (413 `FILE_TOO_LARGE`, 415, 429…).
 */
export function uploadPublicFeedbackFile(
  slug: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PublicFeedbackUpload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1/public/feedback/${slug}/uploads`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: handled below.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = publicFeedbackUploadSchema.safeParse(body);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError(xhr.status, 'HTTP_ERROR', 'Unexpected response'));
        return;
      }
      const error = apiErrorSchema.safeParse(body);
      const options = { retryAfter: parseRetryAfter(xhr.getResponseHeader('retry-after')) };
      reject(
        error.success
          ? new ApiError(xhr.status, error.data.error.code, error.data.error.message, options)
          : new ApiError(
              xhr.status,
              xhr.status === 413 ? 'FILE_TOO_LARGE' : 'HTTP_ERROR',
              xhr.statusText,
              options,
            ),
      );
    };
    xhr.onerror = () => {
      reject(new ApiError(0, 'NETWORK_ERROR', 'Network error'));
    };
    xhr.onabort = () => {
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', () => {
      xhr.abort();
    });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/** Removes an upload the form hasn't sent yet (best effort). */
export function removePublicFeedbackUpload(upload: { id: string; token: string }) {
  return apiFetch(`/public/feedback/uploads/${upload.id}`, z.null(), {
    method: 'DELETE',
    headers: { [FEEDBACK_UPLOAD_TOKEN_HEADER]: upload.token },
  }).catch(() => null);
}
