import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  /** Expanded spaces in the sidebar tree; missing = collapsed. */
  openSpaces: Record<string, boolean>;
  lastWorkspaceId: string | null;
  /**
   * List groups the user collapsed or expanded, per list (`p:<projectId>` / `s:<spaceId>`) and
   * group (`status:<id>`, `assignee:<id>` …); missing = the group's default.
   */
  collapsedGroups: Record<string, Record<string, boolean>>;
  /** Quick-create modal (phase 12). */
  createOpen: boolean;
  toggleSidebar: () => void;
  setSpaceOpen: (spaceId: string, open: boolean) => void;
  setLastWorkspace: (workspaceId: string) => void;
  setGroupCollapsed: (list: string, group: string, collapsed: boolean) => void;
  openCreate: () => void;
  closeCreate: () => void;
}

/** UI-only state (never server data). Layout preferences persist in localStorage. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      openSpaces: {},
      lastWorkspaceId: null,
      collapsedGroups: {},
      createOpen: false,
      toggleSidebar: () => {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
      },
      setSpaceOpen: (spaceId, open) => {
        set((s) => ({ openSpaces: { ...s.openSpaces, [spaceId]: open } }));
      },
      setLastWorkspace: (workspaceId) => {
        set({ lastWorkspaceId: workspaceId });
      },
      setGroupCollapsed: (list, group, collapsed) => {
        set((s) => ({
          collapsedGroups: {
            ...s.collapsedGroups,
            [list]: { ...s.collapsedGroups[list], [group]: collapsed },
          },
        }));
      },
      openCreate: () => {
        set({ createOpen: true });
      },
      closeCreate: () => {
        set({ createOpen: false });
      },
    }),
    {
      name: 'kite.ui',
      // Private mode / blocked storage: zustand falls back to memory when getItem throws.
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        openSpaces: s.openSpaces,
        lastWorkspaceId: s.lastWorkspaceId,
        collapsedGroups: s.collapsedGroups,
      }),
    },
  ),
);
