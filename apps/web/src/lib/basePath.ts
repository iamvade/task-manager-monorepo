/** `/tasks/` → `/tasks`, `/` → `''`: Vite's `base` without its trailing slash. */
export function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Where the app is served: `''` at the domain root, `/tasks` when built with `BASE_PATH=/tasks`
 * (behind a proxy that strips the prefix before the API). Router paths are relative to it.
 */
export const BASE_PATH = trimBase(import.meta.env.BASE_URL);

/** `/api/v1{path}` under the base path (fetches, download links). */
export const apiUrl = (path: string, base = BASE_PATH) => `${base}/api/v1${path}`;

/** Absolute link to an app route, e.g. for the clipboard: `appUrl('/t/APP-1')`. */
export const appUrl = (path: string, base = BASE_PATH) => `${window.location.origin}${base}${path}`;
