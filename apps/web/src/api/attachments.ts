import { attachmentSchema, type Attachment } from '@kite/shared';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';
import { bumpCount, patchTask, restoreTask, settle } from './taskCache';
import { TASK_MUTATION } from '@kite/shared/client';

/** Download link (`inline` previews png/jpeg/gif/webp in an <img>); the session cookie applies. */
export const attachmentUrl = (id: string, { inline = false } = {}) =>
  `/api/v1/attachments/${id}/download${inline ? '?inline=true' : ''}`;

/** PNG/JPEG/GIF/WebP: the server streams these inline, so the drawer previews them. */
export const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Saves the file under its original name. */
export function downloadAttachment(attachment: Attachment) {
  const link = document.createElement('a');
  link.href = attachmentUrl(attachment.id);
  link.download = attachment.filename;
  link.click();
}

const uploadKey = (taskId: string) => [...TASK_MUTATION, 'upload', taskId] as const;

/**
 * Uploads one file (`POST /tasks/:id/attachments`, multipart field `file`). Uploading files
 * show as pending cards (`usePendingUploads`) until the server answers.
 */
export function useUploadAttachment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: uploadKey(taskId),
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiFetch(`/tasks/${taskId}/attachments`, attachmentSchema, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async (attachment) => {
      await patchTask(
        queryClient,
        taskId,
        (t) => ({ ...t, attachmentCount: t.attachmentCount + 1 }),
        (d) => ({
          ...d,
          attachmentCount: d.attachmentCount + 1,
          attachments: [...d.attachments.filter((a) => a.id !== attachment.id), attachment],
        }),
      );
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

/** Files of `taskId` still uploading. */
export function usePendingUploads(taskId: string): File[] {
  return useMutationState({
    filters: { mutationKey: uploadKey(taskId), status: 'pending' },
    select: (m) => m.state.variables as File,
  });
}

/** `DELETE /attachments/:id` (uploader or admin), removed from the drawer right away. */
export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ attachment }: { taskId: string; attachment: Attachment }) =>
      apiSend(`/attachments/${attachment.id}`, z.null(), 'DELETE'),
    onMutate: async ({ taskId, attachment }) => {
      const counts = await bumpCount(queryClient, taskId, 'attachmentCount', -1);
      const detail = await patchTask(queryClient, taskId, null, (d) => ({
        ...d,
        attachments: d.attachments.filter((a) => a.id !== attachment.id),
      }));
      return { snapshot: { lists: counts.lists, details: counts.details }, detail };
    },
    onError: (_err, _vars, context) => {
      restoreTask(queryClient, context?.snapshot);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}
