/** App pages live under their workspace: `/w/:slug/my-tasks`, `/w/:slug/p/:projectId/list`… */
export const wsPath = (slug: string, path: string) => `/w/${slug}${path}`;

/**
 * The page's path inside its workspace (`/w/kite-studio/p/1/list` → `/p/1/list`); paths outside
 * a workspace come back unchanged.
 */
export function appPath(pathname: string): string {
  const match = /^\/w\/[^/]+(\/.*)?$/.exec(pathname);
  return match ? (match[1] ?? '/') : pathname;
}

/** Pages that exist in every workspace: switching keeps you on the same one. */
const SECTIONS = ['my-tasks', 'inbox', 'feedback', 'reports', 'settings', 'standup'];

/** Where switching from `pathname` lands in workspace `slug`: the same section, else My Tasks. */
export function switchTarget(slug: string, pathname: string): string {
  const section = appPath(pathname).split('/')[1] ?? '';
  return wsPath(slug, `/${SECTIONS.includes(section) ? section : 'my-tasks'}`);
}
