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

/** Sections that are the same in every workspace (they belong to the person): switching keeps the whole path. */
const PERSONAL_SECTIONS = ['personal'];

/** Where switching from `pathname` lands in workspace `slug`: the same section, else My Tasks. */
export function switchTarget(slug: string, pathname: string): string {
  const path = appPath(pathname);
  const section = path.split('/')[1] ?? '';
  if (PERSONAL_SECTIONS.includes(section)) return wsPath(slug, path);
  return wsPath(slug, `/${SECTIONS.includes(section) ? section : 'my-tasks'}`);
}
