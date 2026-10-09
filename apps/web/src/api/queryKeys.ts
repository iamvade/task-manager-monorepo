/** Every TanStack Query key in one place, so invalidations can't drift from the queries. */
export const queryKeys = {
  me: ['me'] as const,
  sidebar: (workspaceId: string) => ['workspaces', workspaceId, 'sidebar'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  sprints: (projectId: string) => ['projects', projectId, 'sprints'] as const,
};
