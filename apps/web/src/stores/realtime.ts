import { create } from 'zustand';

/** `connecting` until the first open, `reconnecting` after a drop. */
export type RealtimeStatus = 'connecting' | 'open' | 'reconnecting';

interface RealtimeState {
  status: RealtimeStatus;
  /** The workspace the socket is subscribed to (messages of any other are stale). */
  workspaceId: string | null;
  /** Users with an open tab in the workspace (me included). */
  online: ReadonlySet<string>;
  /** Users viewing each task (drawer or full page). */
  viewers: Readonly<Record<string, readonly string[]>>;
  setStatus: (status: RealtimeStatus) => void;
  ready: (
    workspaceId: string,
    online: readonly string[],
    viewers: Record<string, string[]>,
  ) => void;
  setOnline: (userId: string, online: boolean) => void;
  setViewers: (taskId: string, userIds: readonly string[]) => void;
  reset: () => void;
}

const empty = { workspaceId: null, online: new Set<string>(), viewers: {} };

/**
 * Connection status and presence pushed over the realtime socket. Ephemeral (kept in the
 * WebSocket server's memory, never fetched), so it lives here rather than in the query cache.
 */
export const useRealtimeStore = create<RealtimeState>()((set) => ({
  status: 'connecting',
  ...empty,
  // Presence is only as good as the connection: forget it when the socket drops.
  setStatus: (status) => {
    set(status === 'open' ? { status } : { status, ...empty });
  },
  ready: (workspaceId, online, viewers) => {
    set({ workspaceId, online: new Set(online), viewers });
  },
  setOnline: (userId, online) => {
    set((s) => {
      if (s.online.has(userId) === online) return s;
      const next = new Set(s.online);
      if (online) next.add(userId);
      else next.delete(userId);
      return { online: next };
    });
  },
  setViewers: (taskId, userIds) => {
    set((s) => {
      const viewers = Object.fromEntries(Object.entries(s.viewers).filter(([id]) => id !== taskId));
      if (userIds.length > 0) viewers[taskId] = userIds;
      return { viewers };
    });
  },
  reset: () => {
    set({ status: 'connecting', ...empty });
  },
}));

const NONE: readonly string[] = [];

/** Users viewing `taskId` right now. */
export function useTaskViewers(taskId: string): readonly string[] {
  return useRealtimeStore((s) => s.viewers[taskId] ?? NONE);
}

export function useOnlineIds(): ReadonlySet<string> {
  return useRealtimeStore((s) => s.online);
}
