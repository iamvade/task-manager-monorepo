/** Every TanStack Query key in one place, so invalidations can't drift from the queries. */
export const queryKeys = {
  me: ['me'] as const,
  /** The platform admin console's workspace list. */
  adminWorkspaces: ['admin', 'workspaces'] as const,
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
  /** By key (`APP-142`, unique per workspace) or id. */
  task: (workspaceId: string, ref: string) => ['tasks', 'detail', workspaceId, ref] as const,
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
  /** My unread inbox count in each of my workspaces (the workspace switcher). */
  unreadCounts: ['unread-counts'] as const,
  /** Prefix of every inbox tab of a workspace. */
  notificationsOf: (workspaceId: string) => ['notifications', workspaceId] as const,
  notifications: (workspaceId: string, tab: string, projectId?: string) =>
    ['notifications', workspaceId, tab, projectId ?? null] as const,
  /** Prefix of the feedback inbox of a workspace (lists and item panels). */
  feedbackOf: (workspaceId: string) => ['feedback', workspaceId] as const,
  feedbackList: (workspaceId: string, query: object) =>
    ['feedback', workspaceId, 'list', query] as const,
  /** One item by ref (`FB-1042`) or id. */
  feedbackItem: (workspaceId: string, ref: string) =>
    ['feedback', workspaceId, 'item', ref] as const,
  feedbackSuggestions: (feedbackId: string) => ['feedback-suggestions', feedbackId] as const,
  /** Unlinked feedback a task can link (task drawer picker). */
  feedbackOptionsAll: ['feedback-options'] as const,
  feedbackOptions: (taskId: string, q: string) => ['feedback-options', taskId, q] as const,
  /** The public form's workspace name and limits (no session). */
  publicFeedbackForm: (slug: string) => ['public-feedback', slug] as const,
  /** My per-project notification levels (Settings → Notifications, project menu). */
  notificationLevels: (workspaceId: string) =>
    ['workspaces', workspaceId, 'notification-levels'] as const,
};
