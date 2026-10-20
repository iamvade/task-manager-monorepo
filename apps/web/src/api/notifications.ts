import {
  notificationPageSchema,
  unreadCountsSchema,
  projectNotificationLevelSchema,
  type NotificationLevel,
  readAllResultSchema,
  type InboxTab,
  type Notification,
  type NotificationPage,
  type SidebarResponse,
} from '@kite/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend, toQuery } from './client';
import { queryKeys } from './queryKeys';

type Pages = InfiniteData<NotificationPage, string>;

/** My unread count per workspace; refetched when the socket says one changed. */
export function useUnreadCounts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.unreadCounts,
    queryFn: () => apiFetch('/me/notifications/unread-counts', unreadCountsSchema),
    enabled,
  });
}

/**
 * One inbox tab (optionally one project), newest first, page by page. `counts` (unread/archived)
 * ride on every page and cover the whole inbox.
 */
export function useNotifications(
  workspaceId: string | undefined,
  tab: InboxTab,
  projectId?: string,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications(workspaceId ?? '', tab, projectId),
    queryFn: ({ pageParam }) =>
      apiFetch(
        `/me/notifications${toQuery({ workspaceId, tab, projectId, cursor: pageParam || undefined })}`,
        notificationPageSchema,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
    // The inbox is the one place people expect to be current: refetch whenever it's shown.
    refetchOnMount: 'always',
  });
}

/** The cached snapshot of every inbox tab + the sidebar, for rollback. */
type Snapshot = { key: readonly unknown[]; data: unknown }[];

async function snapshot(queryClient: QueryClient, workspaceId: string): Promise<Snapshot> {
  const prefix = queryKeys.notificationsOf(workspaceId);
  const sidebarKey = queryKeys.sidebar(workspaceId);
  await queryClient.cancelQueries({ queryKey: prefix });
  return [
    ...queryClient.getQueriesData({ queryKey: prefix }).map(([key, data]) => ({ key, data })),
    { key: sidebarKey, data: queryClient.getQueryData(sidebarKey) },
  ];
}

function restore(queryClient: QueryClient, snap: Snapshot | undefined) {
  snap?.forEach(({ key, data }) => {
    if (data !== undefined) queryClient.setQueryData(key, data);
  });
}

interface Patch {
  /** New version of an item; null drops it from that tab. */
  item: (n: Notification, tab: InboxTab) => Notification | null;
  counts: (c: NotificationPage['counts']) => NotificationPage['counts'];
}

/** Applies `patch` to every cached tab of the workspace and the sidebar badge. */
function patchInbox(queryClient: QueryClient, workspaceId: string, patch: Patch) {
  for (const [key, data] of queryClient.getQueriesData<Pages>({
    queryKey: queryKeys.notificationsOf(workspaceId),
  })) {
    if (!data) continue;
    const tab = key[2] as InboxTab;
    queryClient.setQueryData<Pages>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((n) => patch.item(n, tab) ?? []),
        counts: patch.counts(page.counts),
      })),
    });
  }
  const sidebarKey = queryKeys.sidebar(workspaceId);
  const sidebar = queryClient.getQueryData<SidebarResponse>(sidebarKey);
  if (sidebar) {
    const { unread } = patch.counts({ unread: sidebar.inboxUnreadCount, archived: 0 });
    queryClient.setQueryData(sidebarKey, { ...sidebar, inboxUnreadCount: unread });
  }
}

/** After any inbox write: the tabs, the badge and My Tasks' unread dots. */
function settleInbox(queryClient: QueryClient, workspaceId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsOf(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
}

const isUnread = (n: Notification) => n.readAt === null && n.archivedAt === null;

function useInboxMutation<V>(
  workspaceId: string,
  send: (vars: V) => Promise<unknown>,
  patch: (vars: V, now: string) => Patch,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: V) => {
      const snap = await snapshot(queryClient, workspaceId);
      patchInbox(queryClient, workspaceId, patch(vars, new Date().toISOString()));
      return snap;
    },
    onError: (_err, _vars, snap) => {
      restore(queryClient, snap);
    },
    onSettled: () => {
      settleInbox(queryClient, workspaceId);
    },
  });
}

export function useMarkNotificationRead(workspaceId: string) {
  return useInboxMutation(
    workspaceId,
    (n: Notification) => apiSend(`/me/notifications/${n.id}/read`, z.null(), 'POST'),
    (target, now) => ({
      item: (n) => (n.id === target.id ? { ...n, readAt: n.readAt ?? now } : n),
      counts: (c) => ({ ...c, unread: Math.max(0, c.unread - (isUnread(target) ? 1 : 0)) }),
    }),
  );
}

export function useArchiveNotification(workspaceId: string) {
  return useInboxMutation(
    workspaceId,
    (n: Notification) => apiSend(`/me/notifications/${n.id}/archive`, z.null(), 'POST'),
    (target, now) => ({
      item: (n, tab) =>
        n.id !== target.id
          ? n
          : tab === 'archived'
            ? { ...n, readAt: n.readAt ?? now, archivedAt: now }
            : null,
      counts: (c) => ({
        unread: Math.max(0, c.unread - (isUnread(target) ? 1 : 0)),
        archived: c.archived + 1,
      }),
    }),
  );
}

/** Undo of an archive: back in the inbox, still read. The tabs refetch to place it. */
export function useUnarchiveNotification(workspaceId: string) {
  return useInboxMutation(
    workspaceId,
    (n: Notification) => apiSend(`/me/notifications/${n.id}/unarchive`, z.null(), 'POST'),
    (target) => ({
      item: (n, tab) => (n.id === target.id && tab === 'archived' ? null : n),
      counts: (c) => ({ ...c, archived: Math.max(0, c.archived - 1) }),
    }),
  );
}

export function useMarkAllNotificationsRead(workspaceId: string) {
  return useInboxMutation<undefined>(
    workspaceId,
    () => apiSend('/me/notifications/read-all', readAllResultSchema, 'POST', { workspaceId }),
    (_vars, now) => ({
      item: (n) => (n.archivedAt === null ? { ...n, readAt: n.readAt ?? now } : n),
      counts: (c) => ({ ...c, unread: 0 }),
    }),
  );
}

/** My levels for the workspace's projects (missing project = `all`). */
export function useNotificationLevels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notificationLevels(workspaceId ?? ''),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/notification-levels`,
        z.array(projectNotificationLevelSchema),
      ),
    enabled: Boolean(workspaceId),
    select: (rows) => new Map(rows.map((r) => [r.projectId, r.level])),
  });
}

/** Sets my level for a project; the cached list follows right away. */
export function useSetNotificationLevel(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.notificationLevels(workspaceId ?? '');
  type Rows = z.infer<typeof projectNotificationLevelSchema>[];
  return useMutation({
    mutationFn: ({ projectId, level }: { projectId: string; level: NotificationLevel }) =>
      apiSend(`/projects/${projectId}/notification-level`, projectNotificationLevelSchema, 'PUT', {
        level,
      }),
    onMutate: async ({ projectId, level }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Rows>(key);
      queryClient.setQueryData<Rows>(key, (rows = []) => [
        ...rows.filter((r) => r.projectId !== projectId),
        ...(level === 'all' ? [] : [{ projectId, level }]),
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
  });
}
