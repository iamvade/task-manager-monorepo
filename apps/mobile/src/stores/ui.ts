import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** The persisted part (never server data). Later phases add their own fields here. */
interface UiData {
  /** The workspace opened last: `/` goes to its My Tasks. */
  lastWorkspaceId: string | null;
  /** The standup group opened last in each workspace (the Standup tab goes there). */
  lastStandupGroupIds: Record<string, string>;
}

interface UiState extends UiData {
  /**
   * The account whose state is loaded (`null` signed out); `undefined` until the first
   * `scopeUiStore`. Screens that read saved state wait for it to match the signed-in user.
   */
  scopedTo: string | null | undefined;
  setLastWorkspace: (workspaceId: string) => void;
  setLastStandupGroup: (workspaceId: string, groupId: string) => void;
}

const initialUiState: UiData = {
  lastWorkspaceId: null,
  lastStandupGroupIds: {},
};

/** Signed out, or before `/auth/me` answers. Signed in: `kite.ui.<userId>` (as on the web). */
const ANONYMOUS_KEY = 'kite.ui';
const uiStorageKey = (userId: string | null) =>
  userId ? `${ANONYMOUS_KEY}.${userId}` : ANONYMOUS_KEY;

const storage = createMMKV({ id: 'kite.ui' });

const mmkvStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => {
    storage.set(name, value);
  },
  removeItem: (name) => {
    storage.remove(name);
  },
};

/** UI-only state, per account, in MMKV (synchronous: no flash of defaults on launch). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...initialUiState,
      scopedTo: undefined,
      setLastWorkspace: (workspaceId) => {
        set({ lastWorkspaceId: workspaceId });
      },
      setLastStandupGroup: (workspaceId, groupId) => {
        set((s) => ({ lastStandupGroupIds: { ...s.lastStandupGroupIds, [workspaceId]: groupId } }));
      },
    }),
    {
      name: ANONYMOUS_KEY,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s): UiData => ({
        lastWorkspaceId: s.lastWorkspaceId,
        lastStandupGroupIds: s.lastStandupGroupIds,
      }),
    },
  ),
);

/** The persisted slice stored under `name`, or null when there is none. */
function readStored(name: string): Partial<UiData> | null {
  try {
    const raw = storage.getString(name);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      const { state } = parsed as { state?: Partial<UiData> | null };
      if (state && typeof state === 'object') return state;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Keeps UI state per account (several people can sign in on one phone over time): switches the
 * persisted key to the user's (`kite.ui.<id>`), resets to defaults and loads what that user
 * saved. The pre-account `kite.ui` entry is adopted by the first user who signs in, then removed.
 */
export function scopeUiStore(userId: string | null) {
  const name = uiStorageKey(userId);
  if (useUiStore.persist.getOptions().name === name) {
    if (useUiStore.getState().scopedTo !== userId) useUiStore.setState({ scopedTo: userId });
    return;
  }
  useUiStore.persist.setOptions({ name });
  let stored = readStored(name);
  if (userId && !stored) {
    stored = readStored(ANONYMOUS_KEY);
    storage.remove(ANONYMOUS_KEY);
  }
  useUiStore.setState({ ...initialUiState, ...stored, scopedTo: userId });
}
