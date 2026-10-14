import { create } from 'zustand';

/** `connecting` until the first open, `reconnecting` after a drop. */
export type RealtimeStatus = 'connecting' | 'open' | 'reconnecting';

/** Drawer fields another person can change under you ("Edited by X just now"). */
export type EditedField = 'title' | 'status' | 'priority' | 'due' | 'assignees';

export interface RecentEdit {
  actorId: string;
  /** `Date.now()` when the change arrived. */
  at: number;
}

/** How long "Edited by X just now" stays up. */
export const RECENT_EDIT_MS = 10_000;

interface RealtimeState {
  status: RealtimeStatus;
  /** The workspace the socket is subscribed to (messages of any other are stale). */
  workspaceId: string | null;
  /** Users with an open tab in the workspace (me included). */
  online: ReadonlySet<string>;
  /** Users viewing each task (drawer or full page). */
  viewers: Readonly<Record<string, readonly string[]>>;
  /** Who last changed which drawer field of a task, from other people's realtime updates. */
  recentEdits: Readonly<Record<string, Partial<Record<EditedField, RecentEdit>>>>;
  noteEdits: (taskId: string, actorId: string, fields: readonly EditedField[]) => void;
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

const empty = { workspaceId: null, online: new Set<string>(), viewers: {}, recentEdits: {} };

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
  noteEdits: (taskId, actorId, fields) => {
    if (fields.length === 0) return;
    const at = Date.now();
    // Each note goes away after 10 s unless a newer one replaced it.
    setTimeout(() => {
      set((s) => {
        const current = s.recentEdits[taskId];
        if (!current) return s;
        const kept = Object.fromEntries(
          Object.entries(current).filter(([, e]) => e.at !== at),
        ) as Partial<Record<EditedField, RecentEdit>>;
        const recentEdits = Object.fromEntries(
          Object.entries(s.recentEdits).filter(([id]) => id !== taskId),
        );
        if (Object.keys(kept).length > 0) recentEdits[taskId] = kept;
        return { recentEdits };
      });
    }, RECENT_EDIT_MS);
    set((s) => ({
      recentEdits: {
        ...s.recentEdits,
        [taskId]: {
          ...s.recentEdits[taskId],
          ...Object.fromEntries(fields.map((f) => [f, { actorId, at }])),
        },
      },
    }));
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

/** Who changed `field` of `taskId` in the last 10 s (someone else, via realtime), else null. */
export function useRecentEdit(taskId: string, field: EditedField, meId: string | undefined) {
  const edit = useRealtimeStore((s) => s.recentEdits[taskId]?.[field]);
  return edit && edit.actorId !== meId ? edit.actorId : null;
}
