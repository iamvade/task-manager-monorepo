import { meResponseSchema } from '@kite/shared';
import { ME } from '@kite/shared/testing';
import { z } from 'zod';
import { queryKeys } from '@kite/shared/client';
import { ApiError, NetworkError, apiFetch, apiSend } from '../client';
import { queryClient } from '../queryClient';
import { currentToken } from '../session';
import { API, TOKEN, apiError, json, mockApi, resetApp, signedInSession } from '../../test/app';

const headersOf = (fetch: ReturnType<typeof mockApi>) => {
  const init = fetch.mock.calls[0]?.[1];
  return new Headers(init?.headers);
};

describe('api client', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('calls the API origin with the bearer token and client id, and parses the body', async () => {
    await signedInSession();
    const fetch = mockApi({ 'GET /auth/me': () => json(ME) });
    await expect(apiFetch('/auth/me', meResponseSchema)).resolves.toMatchObject({
      user: { email: 'anu@kite.test' },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(`${API}/auth/me`);
    const headers = headersOf(fetch);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('x-kite-client')).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    // No cookies: the app never relies on them.
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBeUndefined();
  });

  it('sends no Authorization header when signed out', async () => {
    const fetch = mockApi({ 'POST /auth/login': () => json(ME) });
    await apiSend('/auth/login', meResponseSchema, 'POST', { email: 'a@b.c', password: 'x' });
    expect(headersOf(fetch).has('authorization')).toBe(false);
  });

  it('turns error bodies into typed ApiErrors', async () => {
    mockApi({
      'POST /invites/x/accept': () =>
        new Response(
          JSON.stringify({
            error: { code: 'VALIDATION_ERROR', message: 'Bad', fields: { name: 'too_short' } },
          }),
          { status: 400 },
        ),
      'GET /health': () => new Response('<html>', { status: 503, statusText: 'Unavailable' }),
    });
    const error = await apiSend('/invites/x/accept', z.null(), 'POST', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { name: 'too_short' },
    });
    await expect(apiFetch('/health', z.null())).rejects.toMatchObject({
      status: 503,
      code: 'HTTP_ERROR',
    });
  });

  it('reads Retry-After from a 429', async () => {
    mockApi({ 'POST /auth/login': () => apiError(429, 'RATE_LIMITED', { 'Retry-After': '120' }) });
    await expect(apiSend('/auth/login', z.null(), 'POST', {})).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfter: 120,
    });
  });

  it('signs out once on a 401 with a session', async () => {
    await signedInSession();
    queryClient.setQueryData(queryKeys.me, ME);
    queryClient.setQueryData(queryKeys.unreadCounts, []);
    mockApi({ 'GET /me/home': () => apiError(401, 'UNAUTHORIZED') });
    await expect(apiFetch('/me/home', z.null())).rejects.toMatchObject({ status: 401 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(currentToken()).toBeNull();
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
    expect(queryClient.getQueryData(queryKeys.unreadCounts)).toBeUndefined();
  });

  it('keeps a wrong-password 401 a form error (no session to end)', async () => {
    queryClient.setQueryData(queryKeys.unreadCounts, []);
    mockApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS') });
    await expect(apiSend('/auth/login', z.null(), 'POST', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(queryClient.getQueryData(queryKeys.unreadCounts)).toEqual([]);
  });

  it('reports an unreachable server as NetworkError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/auth/me', z.null())).rejects.toBeInstanceOf(NetworkError);
  });

  it('rejects a response that does not match the schema', async () => {
    mockApi({ 'GET /auth/me': () => json({ user: null }) });
    await expect(apiFetch('/auth/me', meResponseSchema)).rejects.toThrow();
  });
});
