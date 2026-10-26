import { ApiError } from '@kite/shared/client';
import { QueryClient } from '@tanstack/react-query';

/** Kept this long when unused, so the persisted cache has something to restore offline. */
export const CACHE_GC_MS = 24 * 60 * 60_000;

/** Client errors (4xx) won't change on a retry; network and server errors may. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Coming back to the app refetches what went stale (focus = AppState active).
      queries: { staleTime: 30_000, gcTime: CACHE_GC_MS, retry: shouldRetry },
    },
  });
}

/** The app's one query client (sign-out and the 401 handler reach it outside React). */
export const queryClient = createQueryClient();
