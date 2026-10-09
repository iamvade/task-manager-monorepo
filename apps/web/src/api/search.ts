import { searchResultSchema } from '@kite/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, toQuery } from './client';
import { queryKeys } from './queryKeys';

const DEBOUNCE_MS = 150;

/**
 * ⌘K search: tasks (by key or title), projects and people in the workspace. Waits for a short
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

  return useQuery({
    queryKey: queryKeys.search(workspaceId ?? '', debounced),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/search${toQuery({ q: debounced })}`,
        searchResultSchema,
      ),
    enabled: Boolean(workspaceId && debounced && q),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
