import { vi } from 'vitest';

export {
  ME,
  PROJECT,
  PROJECT_ID,
  SIDEBAR,
  SPACE_ID,
  SPRINT_ID,
  WORKSPACE_ID,
} from '@kite/shared/testing';

export const unauthorized = () =>
  Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });

/** A pending promise lets a test look at the optimistic state before the server answers. */
type Handler = (init?: RequestInit) => Response | Promise<Response>;

/** Stubs fetch with `"METHOD /api/v1/path"` handlers; unknown requests throw. */
export function mockApi(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    // An exact "METHOD /path?query" handler wins; otherwise one for the path alone.
    const handler = handlers[key] ?? handlers[key.split('?')[0] ?? key];
    if (!handler) throw new Error(`Unexpected request ${key}`);
    return Promise.resolve(handler(init));
  });
}
