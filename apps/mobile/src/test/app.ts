import { ME, WORKSPACE_ID } from '@kite/shared/testing';
import type { MeResponse } from '@kite/shared';
import { cachePersister } from '../api/persist';
import { queryClient } from '../api/queryClient';
import { clearSession, saveSession } from '../api/session';
import { useRealtimeStore } from '../stores/realtime';
import { scopeUiStore, useUiStore } from '../stores/ui';

export const API = 'http://localhost:3000/api/v1';
export const LABS_ID = '01890000-0000-7000-8000-000000000003';
export const TOKEN = 'test-session-token-0123456789abcdefghijklmnop';

/** Anu in Kite Studio and Kite Labs (the seed's two workspaces). */
export const ME_TWO: MeResponse = {
  ...(ME as MeResponse),
  workspaces: [
    { id: WORKSPACE_ID, name: 'Kite Studio', slug: 'kite-studio', role: 'owner', title: null },
    { id: LABS_ID, name: 'Kite Labs', slug: 'kite-labs', role: 'member', title: null },
  ],
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

/** Stubs fetch with `"METHOD /path"` handlers (path after `/api/v1`); unknown requests throw. */
export function mockApi(handlers: Record<string, Handler>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(API) ? url.slice(API.length) : url;
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = handlers[key] ?? handlers[key.split('?')[0] ?? key];
    if (!handler) return Promise.reject(new Error(`Unexpected request ${key}`));
    return Promise.resolve(handler(init));
  });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message: code } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** A saved session, as after signing in on an earlier launch. */
export function signedInSession() {
  return saveSession({ token: TOKEN, expiresAt: '2026-11-25T00:00:00.000Z' });
}

/** Back to a fresh install: no session, empty caches, default UI state. */
export async function resetApp() {
  jest.restoreAllMocks();
  await clearSession();
  queryClient.clear();
  await cachePersister.removeClient();
  // Anu's saved UI state and the signed-out one.
  scopeUiStore(ME.user.id);
  useUiStore.persist.clearStorage();
  scopeUiStore(null);
  useUiStore.persist.clearStorage();
  useUiStore.setState({ lastWorkspaceId: null, lastStandupGroupIds: {} });
  useRealtimeStore.getState().reset();
}

/** `userId`'s saved UI state, as left by an earlier launch. */
export function savedUiState(userId: string, lastWorkspaceId: string) {
  scopeUiStore(userId);
  useUiStore.getState().setLastWorkspace(lastWorkspaceId);
  scopeUiStore(null);
}
