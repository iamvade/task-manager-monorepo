import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  NetworkError,
  createApiClient,
  isApiError,
  parseRetryAfter,
  toQuery,
} from './http.js';

describe('parseRetryAfter', () => {
  it('reads whole seconds', () => {
    expect(parseRetryAfter('51')).toBe(51);
    expect(parseRetryAfter(' 7 ')).toBe(7);
  });

  it('ignores missing, HTTP-date and malformed values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter('-3')).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
  });
});

describe('toQuery', () => {
  it('skips empty values and repeats arrays', () => {
    expect(toQuery({ a: 1, b: ['x', 'y'], c: null, d: undefined, e: false })).toBe(
      '?a=1&b=x&b=y&e=false',
    );
    expect(toQuery({})).toBe('');
  });
});

function client(response: () => Response | Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
  const onUnauthorized = vi.fn();
  const api = createApiClient({
    baseUrl: 'https://kite.test/api/v1',
    headers: () => ({ 'x-kite-client': 'client-1', Authorization: 'Bearer t0k' }),
    onUnauthorized,
    fetch,
  });
  return { api, fetch, onUnauthorized };
}

const requestOf = (fetch: ReturnType<typeof client>['fetch']) => {
  const [url, init] = fetch.mock.calls[0] ?? [];
  return { url, init, headers: new Headers(init?.headers) };
};

describe('createApiClient', () => {
  it('prefixes the base URL, adds the headers and parses the body', async () => {
    const { api, fetch } = client(() => Response.json({ ok: true }));
    await expect(api.apiFetch('/auth/me', z.object({ ok: z.boolean() }))).resolves.toEqual({
      ok: true,
    });
    const { url, headers } = requestOf(fetch);
    expect(url).toBe('https://kite.test/api/v1/auth/me');
    expect(headers.get('authorization')).toBe('Bearer t0k');
    expect(headers.get('x-kite-client')).toBe('client-1');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('sends JSON bodies and reads 204 as null', async () => {
    const { api, fetch } = client(() => new Response(null, { status: 204 }));
    await expect(api.apiSend('/auth/logout', z.null(), 'POST', { a: 1 })).resolves.toBeNull();
    const { init, headers } = requestOf(fetch);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('turns an error body into an ApiError with fields and Retry-After', async () => {
    const { api, onUnauthorized } = client(() =>
      Response.json(
        { error: { code: 'RATE_LIMITED', message: 'Slow down', fields: { email: 'x' } } },
        { status: 429, headers: { 'Retry-After': '42' } },
      ),
    );
    const error = await api.apiFetch('/auth/login', z.null()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Slow down',
      retryAfter: 42,
      fields: { email: 'x' },
    });
    expect(isApiError(error, 'RATE_LIMITED')).toBe(true);
    expect(isApiError(error, 'OTHER')).toBe(false);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('names a non-JSON error HTTP_ERROR', async () => {
    const { api } = client(
      () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(api.apiFetch('/x', z.null())).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'Bad Gateway',
    });
  });

  it('reports a 401 with its path', async () => {
    const { api, onUnauthorized } = client(() =>
      Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in' } }, { status: 401 }),
    );
    await expect(api.apiFetch('/me/home', z.null())).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledWith('/me/home');
  });

  it('wraps a failed fetch in NetworkError, but lets aborts through', async () => {
    const { api } = client(() => Promise.reject(new TypeError('Network request failed')));
    await expect(api.apiFetch('/x', z.null())).rejects.toBeInstanceOf(NetworkError);

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const aborted = client(() => Promise.reject(abort));
    await expect(aborted.api.apiFetch('/x', z.null())).rejects.toBe(abort);
  });

  it('rejects a body that does not match the schema', async () => {
    const { api } = client(() => Response.json({ ok: 'yes' }));
    await expect(api.apiFetch('/x', z.object({ ok: z.boolean() }))).rejects.toThrow();
  });
});
