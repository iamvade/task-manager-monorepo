import { searchResultSchema } from '@kite/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, toQuery } from './client';
import { queryKeys } from './queryKeys';

const DEBOUNCE_MS = 150;

/**
 * ⌘K search: tasks (by key, title or description), projects, people and comments in the
 * workspace; later pages ("Show more tasks") add tasks only. Waits for a short
 * pause in typing and keeps the previous results on screen while the next ones load.
 */
export function useSearch(workspaceId: string | undefined, query: string) {
  const q = query.trim().slice(0, 200);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(q);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  return useInfiniteQuery({
    queryKey: queryKeys.search(workspaceId ?? '', debounced),
    queryFn: ({ pageParam }) =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/search${toQuery({
          q: debounced,
          offset: pageParam ? String(pageParam) : undefined,
        })}`,
        searchResultSchema,
      ),
    initialPageParam: 0,
    // "Show more tasks" loads the next page (tasks only).
    getNextPageParam: (last) => last.nextTaskOffset ?? undefined,
    enabled: Boolean(workspaceId && debounced && q),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
