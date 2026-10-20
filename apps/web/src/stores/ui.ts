import type { Priority, RichTextNode, StatusCategory, TaskDetail } from '@kite/shared';
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
  /** Prefilled title and description (standup meeting "Create task"). */
  title?: string;
  description?: RichTextNode;
  /**
   * Called with the saved task instead of the form's own follow-up ("Create more" is ignored).
   * Kept in memory only (`createDefaults` isn't persisted).
   */
  onCreated?: (task: TaskDetail) => void;
}

export interface ListColumns {
  /** Task key (`APP-142`) before the title; on by default. */
  key: boolean;
  size: boolean;
}

interface UiState {
  sidebarCollapsed: boolean;
  /** Expanded spaces in the sidebar tree; missing = collapsed. */
  openSpaces: Record<string, boolean>;
  lastWorkspaceId: string | null;
  /** The standup group opened last in each workspace (`/standup` goes there). */
  lastStandupGroupIds: Record<string, string>;
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
  /** Per workspace, project of the last task made in quick create: the default outside a project page. */
  lastCreateProjectIds: Record<string, string>;
  /** Calendar range (Month / Week), shared by every calendar. */
  calendarMode: CalendarMode;
  /** Projects toggled off on a space calendar, per space id. */
  calendarHidden: Record<string, string[]>;
  /** Optional List columns the user turned on (shared by every list). */
  listColumns: ListColumns;
  /** Project brief panels the user expanded (true) or collapsed (false); missing = collapsed. */
  briefOpen: Record<string, boolean>;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  toggleSidebar: () => void;
  setSpaceOpen: (spaceId: string, open: boolean) => void;
  setLastWorkspace: (workspaceId: string) => void;
  setLastStandupGroup: (workspaceId: string, groupId: string) => void;
  setGroupCollapsed: (list: string, group: string, collapsed: boolean) => void;
  openCreate: (defaults?: CreateDefaults) => void;
  closeCreate: () => void;
  setCreateMore: (on: boolean) => void;
  setLastCreateProject: (workspaceId: string, projectId: string) => void;
  setCalendarMode: (mode: CalendarMode) => void;
  toggleCalendarProject: (spaceId: string, projectId: string) => void;
  setListColumn: (column: keyof ListColumns, on: boolean) => void;
  setBriefOpen: (projectId: string, open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

type UiData = Omit<
  UiState,
  | 'toggleSidebar'
  | 'setSpaceOpen'
  | 'setLastWorkspace'
  | 'setLastStandupGroup'
  | 'setGroupCollapsed'
  | 'openCreate'
  | 'closeCreate'
  | 'setCreateMore'
  | 'setLastCreateProject'
  | 'setCalendarMode'
  | 'toggleCalendarProject'
  | 'setListColumn'
  | 'setBriefOpen'
  | 'setPaletteOpen'
  | 'setShortcutsOpen'
>;

export const initialUiState: UiData = {
  sidebarCollapsed: false,
  openSpaces: {},
  lastWorkspaceId: null,
  lastStandupGroupIds: {},
  collapsedGroups: {},
  createOpen: false,
  createDefaults: {},
  createMore: false,
  lastCreateProjectIds: {},
  calendarMode: 'month',
  calendarHidden: {},
  listColumns: { key: true, size: false },
  briefOpen: {},
  paletteOpen: false,
  shortcutsOpen: false,
};

/** Signed out, or before `/auth/me` answers. Signed in: `kite.ui.<userId>`. */
const ANONYMOUS_KEY = 'kite.ui';
const uiStorageKey = (userId: string | null) =>
  userId ? `${ANONYMOUS_KEY}.${userId}` : ANONYMOUS_KEY;

/** UI-only state (never server data). Layout preferences persist in localStorage, per user. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...initialUiState,
      toggleSidebar: () => {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
      },
      setSpaceOpen: (spaceId, open) => {
        set((s) => ({ openSpaces: { ...s.openSpaces, [spaceId]: open } }));
      },
      setLastWorkspace: (workspaceId) => {
        set({ lastWorkspaceId: workspaceId });
      },
      setLastStandupGroup: (workspaceId, groupId) => {
        set((s) => ({ lastStandupGroupIds: { ...s.lastStandupGroupIds, [workspaceId]: groupId } }));
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
      setLastCreateProject: (workspaceId, projectId) => {
        set((s) => ({
          lastCreateProjectIds: { ...s.lastCreateProjectIds, [workspaceId]: projectId },
        }));
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
      setBriefOpen: (projectId, open) => {
        set((s) => ({ briefOpen: { ...s.briefOpen, [projectId]: open } }));
      },
      setPaletteOpen: (open) => {
        set(open ? { paletteOpen: true, shortcutsOpen: false } : { paletteOpen: false });
      },
      setShortcutsOpen: (open) => {
        set(open ? { shortcutsOpen: true, paletteOpen: false } : { shortcutsOpen: false });
      },
    }),
    {
      name: ANONYMOUS_KEY,
      // Private mode / blocked storage: zustand falls back to memory when getItem throws.
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiData>;
        return {
          ...current,
          ...saved,
          listColumns: { ...current.listColumns, ...saved.listColumns },
        };
      },
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        openSpaces: s.openSpaces,
        lastWorkspaceId: s.lastWorkspaceId,
        lastStandupGroupIds: s.lastStandupGroupIds,
        collapsedGroups: s.collapsedGroups,
        createMore: s.createMore,
        lastCreateProjectIds: s.lastCreateProjectIds,
        calendarMode: s.calendarMode,
        calendarHidden: s.calendarHidden,
        listColumns: s.listColumns,
        briefOpen: s.briefOpen,
      }),
    },
  ),
);

/** The persisted slice stored under `name`, or null when there is none (or storage is blocked). */
function readStored(name: string): Partial<UiData> | null {
  try {
    const raw = localStorage.getItem(name);
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

/** Saved state over the defaults; columns added since it was saved get their default. */
function withDefaults(stored: Partial<UiData> | null): UiData {
  return {
    ...initialUiState,
    ...stored,
    listColumns: { ...initialUiState.listColumns, ...stored?.listColumns },
  };
}

/**
 * Keeps layout state per account on a shared browser: switches the persisted key to the
 * user's (`kite.ui.<id>`), resets everything to defaults and loads what that user saved. The
 * pre-account `kite.ui` entry is adopted by the first user who signs in, then removed.
 */
export function scopeUiStore(userId: string | null) {
  const name = uiStorageKey(userId);
  if (useUiStore.persist.getOptions().name === name) return;
  useUiStore.persist.setOptions({ name });
  let stored = readStored(name);
  if (userId && !stored) {
    stored = readStored(ANONYMOUS_KEY);
    try {
      localStorage.removeItem(ANONYMOUS_KEY);
    } catch {
      // Storage blocked: nothing to migrate.
    }
  }
  useUiStore.setState(withDefaults(stored));
}
