/** Every TanStack Query key in one place, so invalidations can't drift from the queries. */
export const queryKeys = {
  me: ['me'] as const,
  sidebar: (workspaceId: string) => ['workspaces', workspaceId, 'sidebar'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  sprints: (projectId: string) => ['projects', projectId, 'sprints'] as const,
  tags: (workspaceId: string) => ['workspaces', workspaceId, 'tags'] as const,
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
};
