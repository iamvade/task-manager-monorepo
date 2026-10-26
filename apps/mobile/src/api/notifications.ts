import { unreadCountsSchema } from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

/** My unread inbox count in each of my workspaces (the workspace switcher). */
export function useUnreadCounts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.unreadCounts,
    queryFn: () => apiFetch('/me/notifications/unread-counts', unreadCountsSchema),
    enabled,
  });
}
