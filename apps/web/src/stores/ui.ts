import type { Priority, StatusCategory } from '@kite/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type CalendarMode = 'month' | 'week';

/** What the quick-create modal starts with (toolbar, `C`, a group's "+", ⌘K). */
export interface CreateDefaults {
  projectId?: string;
  /** Exact status (project list group / board column). */
  statusId?: string;
  /** Space-level groups are status categories: the project's first status of it. */
  statusCategory?: StatusCategory;
  assigneeId?: string;
  priority?: Priority;
  dueDate?: string;
  /** The sprint the view is filtered to (project views). */
  sprintId?: string;
}

export interface ListColumns {
  size: boolean;
}

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
  /** Quick-create modal and what it was opened with. */
  createOpen: boolean;
  createDefaults: CreateDefaults;
  /** Quick create's "Create more" switch (remembered). */
  createMore: boolean;
  /** Calendar range (Month / Week), shared by every calendar. */
  calendarMode: CalendarMode;
  /** Projects toggled off on a space calendar, per space id. */
  calendarHidden: Record<string, string[]>;
  /** Optional List columns the user turned on (shared by every list). */
  listColumns: ListColumns;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  toggleSidebar: () => void;
  setSpaceOpen: (spaceId: string, open: boolean) => void;
  setLastWorkspace: (workspaceId: string) => void;
  setGroupCollapsed: (list: string, group: string, collapsed: boolean) => void;
  openCreate: (defaults?: CreateDefaults) => void;
  closeCreate: () => void;
  setCreateMore: (on: boolean) => void;
  setCalendarMode: (mode: CalendarMode) => void;
  toggleCalendarProject: (spaceId: string, projectId: string) => void;
  setListColumn: (column: keyof ListColumns, on: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
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
      createDefaults: {},
      createMore: false,
      calendarMode: 'month',
      calendarHidden: {},
      listColumns: { size: false },
      paletteOpen: false,
      shortcutsOpen: false,
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
      openCreate: (defaults = {}) => {
        // One overlay at a time: the palette's "New task" hands over to the modal.
        set({
          createOpen: true,
          createDefaults: defaults,
          paletteOpen: false,
          shortcutsOpen: false,
        });
      },
      closeCreate: () => {
        set({ createOpen: false });
      },
      setCreateMore: (on) => {
        set({ createMore: on });
      },
      setCalendarMode: (mode) => {
        set({ calendarMode: mode });
      },
      toggleCalendarProject: (spaceId, projectId) => {
        set((s) => {
          const hidden = s.calendarHidden[spaceId] ?? [];
          return {
            calendarHidden: {
              ...s.calendarHidden,
              [spaceId]: hidden.includes(projectId)
                ? hidden.filter((id) => id !== projectId)
                : [...hidden, projectId],
            },
          };
        });
      },
      setListColumn: (column, on) => {
        set((s) => ({ listColumns: { ...s.listColumns, [column]: on } }));
      },
      setPaletteOpen: (open) => {
        set(open ? { paletteOpen: true, shortcutsOpen: false } : { paletteOpen: false });
      },
      setShortcutsOpen: (open) => {
        set(open ? { shortcutsOpen: true, paletteOpen: false } : { shortcutsOpen: false });
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
        createMore: s.createMore,
        calendarMode: s.calendarMode,
        calendarHidden: s.calendarHidden,
        listColumns: s.listColumns,
      }),
    },
  ),
);
