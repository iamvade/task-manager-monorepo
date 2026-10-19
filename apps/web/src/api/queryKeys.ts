/** Every TanStack Query key in one place, so invalidations can't drift from the queries. */
export const queryKeys = {
  me: ['me'] as const,
  sidebar: (workspaceId: string) => ['workspaces', workspaceId, 'sidebar'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  invites: (workspaceId: string) => ['workspaces', workspaceId, 'invites'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  /** Every sprint of the workspace (they're shared by projects). */
  sprints: (workspaceId: string) => ['workspaces', workspaceId, 'sprints'] as const,
  tags: (workspaceId: string) => ['workspaces', workspaceId, 'tags'] as const,
  /** A member's current and upcoming out-of-office periods. */
  absences: (workspaceId: string, userId: string) =>
    ['workspaces', workspaceId, 'absences', userId] as const,
  absencesOf: (workspaceId: string) => ['workspaces', workspaceId, 'absences'] as const,
  standupGroups: (workspaceId: string) => ['workspaces', workspaceId, 'standup-groups'] as const,
  /** A group's settings; prefix of its days, so one invalidation refreshes both. */
  standupGroup: (groupId: string) => ['standup-groups', groupId] as const,
  standupDay: (groupId: string, date: string) => ['standup-groups', groupId, 'days', date] as const,
  standupDays: (groupId: string) => ['standup-groups', groupId, 'days'] as const,
  /** A day's live meeting (`date` is always a real date, never `today`). */
  standupMeeting: (groupId: string, date: string) =>
    ['standup-groups', groupId, 'meeting', date] as const,
  /** My Yesterday rows and Today chips (write modal); refreshed with the group. */
  standupSuggestions: (groupId: string, date: string) =>
    ['standup-groups', groupId, 'suggestions', date] as const,
  archivedProjects: (workspaceId: string) =>
    ['workspaces', workspaceId, 'archived-projects'] as const,
  /** ⌘K results; under `workspaces` (task writes don't refresh it — results are short-lived). */
  search: (workspaceId: string, q: string) => ['workspaces', workspaceId, 'search', q] as const,
  /** Prefix of every task query (lists + details): one invalidation refreshes them all. */
  tasks: ['tasks'] as const,
  taskLists: ['tasks', 'list'] as const,
  projectTasks: (projectId: string, query: object) =>
    ['tasks', 'list', 'project', projectId, query] as const,
  spaceTasks: (spaceId: string, query: object) =>
    ['tasks', 'list', 'space', spaceId, query] as const,
  taskDetails: ['tasks', 'detail'] as const,
  task: (ref: string) => ['tasks', 'detail', ref] as const,
  /** Drawer feed (history + comments, oldest first); under `tasks` so task writes refresh it. */
  taskActivity: (taskId: string) => ['tasks', 'activity', taskId] as const,
  /** My Tasks (`GET /me/home`); under `tasks` so every task write refreshes it. */
  home: (workspaceId: string) => ['tasks', 'home', workspaceId] as const,
  /** "Show older activity" pages (`GET /me/activity`) after the home's first page. */
  homeActivity: (workspaceId: string) => ['tasks', 'home', workspaceId, 'older'] as const,
  /** Prefix of every report; under `tasks` so task writes refresh them. */
  reports: ['tasks', 'reports'] as const,
  reportsOf: (workspaceId: string) => ['tasks', 'reports', workspaceId] as const,
  report: (workspaceId: string, report: string, query: object) =>
    ['tasks', 'reports', workspaceId, report, query] as const,
  /** Prefix of every inbox tab of a workspace. */
  notificationsOf: (workspaceId: string) => ['notifications', workspaceId] as const,
  notifications: (workspaceId: string, tab: string, projectId?: string) =>
    ['notifications', workspaceId, tab, projectId ?? null] as const,
  /** My per-project notification levels (Settings → Notifications, project menu). */
  notificationLevels: (workspaceId: string) =>
    ['workspaces', workspaceId, 'notification-levels'] as const,
};
