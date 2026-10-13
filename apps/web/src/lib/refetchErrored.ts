import type { QueryClient } from '@tanstack/react-query';

/** Fetches again every query on screen that failed (the page's data, the sidebar, …). */
export function refetchErrored(queryClient: QueryClient) {
  void queryClient.refetchQueries({
    type: 'active',
    predicate: (query) => query.state.status === 'error',
  });
}
