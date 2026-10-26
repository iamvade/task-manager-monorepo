import {
  activityPageSchema,
  homeSchema,
  isClosedCategory,
  taskDetailSchema,
  type Home,
  type SidebarResponse,
  type TaskStatusRef,
} from '@kite/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applyStatus, withRow, type KeptRow } from './homeCache';
import { apiFetch, apiSend, toQuery } from './client';
import { queryKeys } from './queryKeys';
import { TASK_MUTATION, settle } from './taskCache';

export function useHome(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.home(workspaceId ?? ''),
    queryFn: () => apiFetch(`/me/home${toQuery({ workspaceId })}`, homeSchema),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Activity older than the home's first page, fetched page by page from `startCursor` (the
 * home's `nextCursor` when "Show older activity" was first clicked; null = not asked yet).
 */
export function useOlderActivity(workspaceId: string | undefined, startCursor: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.homeActivity(workspaceId ?? ''),
    queryFn: ({ pageParam }) =>
      apiFetch(`/me/activity${toQuery({ workspaceId, cursor: pageParam })}`, activityPageSchema),
    initialPageParam: startCursor ?? '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspaceId && startCursor),
  });
}

interface SetMyTaskStatusVars {
  taskId: string;
  status: TaskStatusRef;
  /** Done before this change (the sidebar count moves only when it flips). */
  wasDone: boolean;
  /** The row as shown, when the page kept it after the server dropped it (reopening it). */
  kept?: KeptRow;
}

/**
 * My Tasks status marker: `PATCH /tasks/:id` like the List and the drawer. The row, the stat
 * cards and the sidebar count move right away; errors roll them back.
 */
export function useSetMyTaskStatus(workspaceId: string) {
  const queryClient = useQueryClient();
  const homeKey = queryKeys.home(workspaceId);
  const sidebarKey = queryKeys.sidebar(workspaceId);
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ taskId, status }: SetMyTaskStatusVars) =>
      apiSend(`/tasks/${taskId}`, taskDetailSchema, 'PATCH', { statusId: status.id }),
    onMutate: async ({ taskId, status, wasDone, kept }) => {
      await queryClient.cancelQueries({ queryKey: homeKey, exact: true });
      const home = queryClient.getQueryData<Home>(homeKey);
      const sidebar = queryClient.getQueryData<SidebarResponse>(sidebarKey);
      // My Tasks rows are open or done; picking Cancelled closes one too.
      const closed = isClosedCategory(status.category);
      if (home) {
        const base = kept ? withRow(home, kept) : home;
        queryClient.setQueryData(homeKey, applyStatus(base, taskId, status, new Date()));
      }
      if (sidebar && closed !== wasDone) {
        queryClient.setQueryData(sidebarKey, {
          ...sidebar,
          myTasksCount: Math.max(0, sidebar.myTasksCount + (closed ? -1 : 1)),
        });
      }
      return { home, sidebar };
    },
    onError: (_err, _vars, context) => {
      if (context?.home) queryClient.setQueryData(homeKey, context.home);
      if (context?.sidebar) queryClient.setQueryData(sidebarKey, context.sidebar);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}
