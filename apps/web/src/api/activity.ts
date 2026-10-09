import {
  commentSchema,
  feedItemSchema,
  type Comment,
  type CommentFeedItem,
  type CommentReply,
  type FeedItem,
  type RichTextNode,
  type UserRef,
} from '@kite/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { queryKeys } from './queryKeys';
import { TASK_MUTATION, bumpCount, restoreTask, settle, type TaskSnapshot } from './taskCache';

const feed = z.array(feedItemSchema);

/** The drawer's merged history + comments (oldest first); the tabs filter it on the client. */
export function useTaskActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.taskActivity(taskId ?? ''),
    queryFn: () => apiFetch(`/tasks/${taskId ?? ''}/activity`, feed),
    enabled: Boolean(taskId),
  });
}

export const isTempComment = (c: Pick<Comment, 'id'>) => c.id.startsWith('temp-');

type FeedEdit = (items: FeedItem[]) => FeedItem[];

/** Applies `edit` to the cached feed; returns the previous feed for rollback. */
async function patchFeed(queryClient: QueryClient, taskId: string, edit: FeedEdit) {
  const key = queryKeys.taskActivity(taskId);
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<FeedItem[]>(key);
  if (previous) queryClient.setQueryData(key, edit(previous));
  return previous;
}

/** Maps every comment (top-level and replies) through `fn`; `null` removes it. */
const mapComments =
  (fn: (c: CommentReply, parent: CommentFeedItem | null) => CommentReply | null): FeedEdit =>
  (items) =>
    items.flatMap((item): FeedItem[] => {
      if (item.kind !== 'comment') return [item];
      const replies = item.replies.flatMap((r) => fn(r, item) ?? []);
      const self = fn(item, null);
      return self ? [{ ...item, ...self, kind: 'comment', replies }] : [];
    });

interface Context {
  feed: FeedItem[] | undefined;
  counts?: TaskSnapshot;
}

function useCommentMutation<V extends { taskId: string }, R>(
  mutationFn: (vars: V) => Promise<R>,
  optimistic: (vars: V) => { edit: FeedEdit; countDelta?: number },
  onSuccess?: (result: R, vars: V) => FeedEdit | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn,
    onMutate: async (vars): Promise<Context> => {
      const { edit, countDelta } = optimistic(vars);
      const previous = await patchFeed(queryClient, vars.taskId, edit);
      const counts = countDelta
        ? await bumpCount(queryClient, vars.taskId, 'commentCount', countDelta)
        : undefined;
      return { feed: previous, counts };
    },
    onError: (_err, vars, context) => {
      if (context?.feed) {
        queryClient.setQueryData(queryKeys.taskActivity(vars.taskId), context.feed);
      }
      restoreTask(queryClient, context?.counts);
    },
    onSuccess: (result, vars) => {
      const edit = onSuccess?.(result, vars);
      if (edit) void patchFeed(queryClient, vars.taskId, edit);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export interface CreateCommentVars {
  taskId: string;
  body: RichTextNode;
  parentId?: string;
  author: UserRef;
  /** Temp id of the optimistic comment (`temp-…`). */
  tempId: string;
}

/** Composer / reply: `POST /tasks/:id/comments`, appended right away. */
export function useCreateComment() {
  return useCommentMutation(
    ({ taskId, body, parentId }: CreateCommentVars) =>
      apiSend(`/tasks/${taskId}/comments`, commentSchema, 'POST', { body, parentId }),
    ({ taskId, body, parentId, author, tempId }) => {
      const temp: Comment = {
        id: tempId,
        taskId,
        parentId: parentId ?? null,
        author,
        body,
        bodyText: '',
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        replies: [],
      };
      return {
        countDelta: 1,
        edit: (items) =>
          parentId
            ? items.map((item) =>
                item.kind === 'comment' && item.id === parentId
                  ? { ...item, replies: [...item.replies, temp] }
                  : item,
              )
            : [...items, { ...temp, kind: 'comment' }],
      };
    },
    (created, { tempId, parentId }) =>
      (items) =>
        items.map((item) => {
          if (item.kind !== 'comment') return item;
          if (!parentId) return item.id === tempId ? { ...created, kind: 'comment' } : item;
          if (item.id !== parentId) return item;
          const { replies: _replies, ...reply } = created;
          return { ...item, replies: item.replies.map((r) => (r.id === tempId ? reply : r)) };
        }),
  );
}

/** Own comment edit: `PATCH /comments/:id`. */
export function useUpdateComment() {
  return useCommentMutation(
    ({ commentId, body }: { taskId: string; commentId: string; body: RichTextNode }) =>
      apiSend(`/comments/${commentId}`, commentSchema, 'PATCH', { body }),
    ({ commentId, body }) => ({
      edit: mapComments((c) =>
        c.id === commentId ? { ...c, body, editedAt: new Date().toISOString() } : c,
      ),
    }),
  );
}

/** `DELETE /comments/:id`; a top-level comment with replies stays as a "deleted" tombstone. */
export function useDeleteComment() {
  return useCommentMutation(
    ({ commentId }: { taskId: string; commentId: string }) =>
      apiSend(`/comments/${commentId}`, z.null(), 'DELETE'),
    ({ commentId }) => ({
      countDelta: -1,
      edit: (items) =>
        items.flatMap((item): FeedItem[] => {
          if (item.kind !== 'comment') return [item];
          if (item.id === commentId) {
            return item.replies.length
              ? [{ ...item, body: null, bodyText: '', deletedAt: new Date().toISOString() }]
              : [];
          }
          return [{ ...item, replies: item.replies.filter((r) => r.id !== commentId) }];
        }),
    }),
  );
}
