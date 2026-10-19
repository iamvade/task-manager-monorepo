import type { PublicFeedbackForm } from '@kite/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import { removePublicFeedbackUpload, uploadPublicFeedbackFile } from '../../../api/feedback';

export type UploadErrorCode =
  'tooBig' | 'typeNotAllowed' | 'uploadFailed' | 'uploadRateLimited' | 'uploadQuota';

export type UploadKind = 'image' | 'video' | 'pdf' | 'file';

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  kind: UploadKind;
  /** Object URL of an image, for the thumbnail (revoked on remove / unmount). */
  previewUrl: string | null;
  status: 'uploading' | 'done' | 'error';
  /** 0–100. */
  progress: number;
  error: UploadErrorCode | null;
  /** What the form sends once the file is on the server. */
  upload: { id: string; token: string } | null;
}

export type UploadLimits = Pick<PublicFeedbackForm, 'maxFiles' | 'maxFileBytes' | 'mimeTypes'>;

type Announce = (kind: 'uploading' | 'done', name: string) => void;

export interface UploadSnapshot {
  errorCount: number;
  /** The finished uploads, as the form sends them. */
  uploads: { id: string; token: string }[];
}

function snapshot(items: readonly UploadItem[]): UploadSnapshot {
  return {
    errorCount: items.filter((item) => item.status === 'error').length,
    uploads: items.flatMap((item) => (item.status === 'done' && item.upload ? [item.upload] : [])),
  };
}

const kindOf = (mime: string): UploadKind =>
  mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime === 'application/pdf'
        ? 'pdf'
        : 'file';

function errorCode(error: unknown): UploadErrorCode {
  if (!(error instanceof ApiError)) return 'uploadFailed';
  switch (error.code) {
    case 'FILE_TOO_LARGE':
      return 'tooBig';
    case 'FILE_TYPE_NOT_ALLOWED':
      return 'typeNotAllowed';
    case 'RATE_LIMITED':
      return 'uploadRateLimited';
    case 'STORAGE_QUOTA_EXCEEDED':
      return 'uploadQuota';
    default:
      return error.status === 413 ? 'tooBig' : 'uploadFailed';
  }
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** The size and type checks the server makes, so a file it would refuse isn't sent at all. */
function clientCheck(file: File, limits: UploadLimits): UploadErrorCode | null {
  if (file.size > limits.maxFileBytes) return 'tooBig';
  // Some browsers leave `type` empty (HEIC on Windows…): the server checks the content anyway.
  if (file.type && !limits.mimeTypes.includes(file.type)) return 'typeNotAllowed';
  return null;
}

const createPreview = (file: File) =>
  typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
const revoke = (item: UploadItem) => {
  if (item.previewUrl && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(item.previewUrl);
  }
};

/**
 * Attachments of the public form. Each file uploads as soon as it's added; rows that failed stay
 * (and count toward the limit) until removed, as in the design. `onSettled` runs whenever the
 * last running upload ends, with the rows as they are then (state may not have rendered yet).
 */
export function useUploads(
  slug: string,
  limits: UploadLimits,
  { onSettled, announce }: { onSettled: (now: UploadSnapshot) => void; announce: Announce },
) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  // The source of truth for the event handlers below (state is its render copy).
  const itemsRef = useRef<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const seq = useRef(0);
  const callbacks = useRef({ onSettled, announce });
  useEffect(() => {
    callbacks.current = { onSettled, announce };
  });

  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const update = useCallback(
    (key: string, patch: Partial<UploadItem>) => {
      commit(itemsRef.current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    },
    [commit],
  );

  const settled = useCallback(() => {
    if (!itemsRef.current.some((item) => item.status === 'uploading')) {
      callbacks.current.onSettled(snapshot(itemsRef.current));
    }
  }, []);

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      let shown = 0;
      uploadPublicFeedbackFile(
        slug,
        file,
        (fraction) => {
          const progress = Math.min(99, Math.round(fraction * 100));
          if (progress === shown) return;
          shown = progress;
          update(key, { progress });
        },
        controller.signal,
      ).then(
        (upload) => {
          controllers.current.delete(key);
          if (!itemsRef.current.some((item) => item.key === key)) {
            void removePublicFeedbackUpload(upload);
            return;
          }
          update(key, {
            status: 'done',
            progress: 100,
            upload: { id: upload.id, token: upload.token },
          });
          callbacks.current.announce('done', file.name);
          settled();
        },
        (error: unknown) => {
          controllers.current.delete(key);
          if (isAbort(error) || !itemsRef.current.some((item) => item.key === key)) return;
          update(key, { status: 'error', error: errorCode(error) });
          settled();
        },
      );
    },
    [slug, update, settled],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      const room = Math.max(0, limits.maxFiles - itemsRef.current.length);
      const accepted = files.slice(0, room);
      setLimitHit(accepted.length < files.length);
      const added = accepted.map((file): [UploadItem, File] => {
        const error = clientCheck(file, limits);
        const kind = kindOf(file.type);
        seq.current += 1;
        return [
          {
            key: `upload-${String(seq.current)}`,
            name: file.name,
            size: file.size,
            kind,
            previewUrl: kind === 'image' ? createPreview(file) : null,
            status: error ? 'error' : 'uploading',
            progress: 0,
            error,
            upload: null,
          },
          file,
        ];
      });
      commit([...itemsRef.current, ...added.map(([item]) => item)]);
      for (const [item, file] of added) {
        if (item.status !== 'uploading') continue;
        callbacks.current.announce('uploading', item.name);
        start(item.key, file);
      }
    },
    [limits, commit, start],
  );

  const remove = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      controllers.current.get(key)?.abort();
      controllers.current.delete(key);
      if (item.upload) void removePublicFeedbackUpload(item.upload);
      revoke(item);
      setLimitHit(false);
      commit(itemsRef.current.filter((i) => i.key !== key));
      settled();
    },
    [commit, settled],
  );

  /** Forgets every row (after sending: the server now owns the files). */
  const reset = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    itemsRef.current.forEach(revoke);
    setLimitHit(false);
    commit([]);
  }, [commit]);

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
      itemsRef.current.forEach(revoke);
    };
  }, []);

  return {
    items,
    add,
    remove,
    reset,
    limitHit,
    busy: items.some((item) => item.status === 'uploading'),
    ...snapshot(items),
  };
}
