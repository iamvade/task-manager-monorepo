import type { QueryClient } from '@tanstack/query-core';
import type { RealtimeServerMessage } from '../schemas/realtime.js';
import { queryKeys } from './query-keys.js';
import { createMessageHandler, type RecentEditListener } from './realtime-cache.js';

/** Where presence goes (each app keeps it in its own realtime store). */
export interface PresenceSink {
  ready: (
    workspaceId: string,
    online: readonly string[],
    viewers: Record<string, string[]>,
  ) => void;
  setOnline: (userId: string, online: boolean) => void;
  setViewers: (taskId: string, userIds: readonly string[]) => void;
}

export interface RealtimeRouterOptions {
  queryClient: QueryClient;
  /** The workspace the app shows now; messages of any other one are stale. */
  currentWorkspaceId: () => string | undefined;
  presence: PresenceSink;
  onRecentEdit?: RecentEditListener;
}

/**
 * Every server message, routed the same way in both apps: unread counts of any workspace,
 * presence to the app's store, and the current workspace's changes into the query cache.
 */
export function createRealtimeRouter(options: RealtimeRouterOptions) {
  const { queryClient, presence } = options;
  const handler = createMessageHandler(queryClient, { onRecentEdit: options.onRecentEdit });
  return {
    handle: (message: RealtimeServerMessage) => {
      // Any workspace: the switcher's unread counts.
      if (message.type === 'notifications.unread_changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCounts });
        return;
      }
      // Messages still in flight for the previous workspace are dropped.
      if ('workspaceId' in message && message.workspaceId !== options.currentWorkspaceId()) return;
      switch (message.type) {
        case 'ready':
          presence.ready(message.workspaceId, message.online, message.viewers);
          return;
        case 'presence.online':
        case 'presence.offline':
          presence.setOnline(message.userId, message.type === 'presence.online');
          return;
        case 'presence.viewers':
          presence.setViewers(message.taskId, message.userIds);
          return;
        default:
          handler.handle(message);
      }
    },
    /** Applies whatever is still waiting (tests, teardown). */
    flush: () => {
      handler.flush();
    },
    dispose: () => {
      handler.dispose();
    },
  };
}
