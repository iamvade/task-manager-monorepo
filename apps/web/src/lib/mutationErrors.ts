import type { Mutation } from '@tanstack/react-query';
import { ApiError, NetworkError } from '../api/client';
import i18n from '../i18n';
import { toast } from '../stores/toast';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** false = the UI shows this mutation's errors itself (inline form errors). */
      errorToast?: boolean;
    };
  }
}

/** API error codes with a message of their own under `errors.*`. */
const KNOWN_CODES = [
  'NOT_FOUND',
  'FORBIDDEN',
  'RATE_LIMITED',
  'FILE_TOO_LARGE',
  'FILE_TYPE_BLOCKED',
  'STORAGE_QUOTA_EXCEEDED',
  'SPACE_NOT_EMPTY',
];

/** The toast text for a failed request: by API error code, offline, or the generic line. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (KNOWN_CODES.includes(error.code))
      return i18n.t(`errors.${error.code}` as 'errors.NOT_FOUND');
    if (error.status === 401) return i18n.t('errors.UNAUTHORIZED');
  } else if (error instanceof NetworkError) {
    // The server couldn't be reached.
    return i18n.t('errors.network');
  }
  return i18n.t('common.genericError');
}

const reported = new WeakSet<object>();

/** The UI shows this error itself (inline): no generic toast. */
export function markErrorHandled(error: unknown) {
  if (typeof error === 'object' && error !== null) reported.add(error);
}

/** A call site's own error toast ("Couldn't move the task"); the generic one is skipped. */
export function reportError(error: unknown, message: string) {
  markErrorHandled(error);
  toast({ message, tone: 'danger' });
}

/**
 * MutationCache `onError`: every failed write shows a danger toast unless the hook opts out
 * (`meta.errorToast: false`) or the call site reported it itself. Call-site callbacks run after
 * this one, so the check waits a tick.
 */
export function toastMutationError(error: unknown, mutation: Mutation<unknown, unknown>) {
  if (mutation.meta?.errorToast === false) return;
  setTimeout(() => {
    if (typeof error === 'object' && error !== null && reported.has(error)) return;
    toast({ message: errorMessage(error), tone: 'danger' });
  }, 0);
}
