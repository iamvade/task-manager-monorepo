import type { z } from 'zod';
import { apiErrorSchema } from '../schemas/error.js';

/** An error response of the API (`{ error: { code, message } }`), or a non-JSON HTTP error. */
export class ApiError extends Error {
  /** Seconds to wait, from a 429's `Retry-After` header. */
  readonly retryAfter: number | undefined;
  /** Per-field error codes (`error.fields`), when a form can show them by its fields. */
  readonly fields: Readonly<Record<string, string>> | undefined;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: { retryAfter?: number; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.retryAfter = options.retryAfter;
    this.fields = options.fields;
  }
}

/** The request never got an answer (offline, DNS, server unreachable). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed', { cause });
    this.name = 'NetworkError';
  }
}

/** `err` is an API error, optionally with `code`. */
export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

/** `Retry-After` in whole seconds; HTTP-date forms and nonsense are ignored. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Number.parseInt(header, 10);
}

type QueryValue = string | number | boolean | null | undefined;

/** `?a=1&b=x&b=y` from an object; null/undefined skipped, arrays repeat the key. */
export function toQuery(params: Record<string, QueryValue | readonly QueryValue[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values as QueryValue[]) {
      if (v !== null && v !== undefined) search.append(key, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface ApiClientOptions {
  /** Prefix of every path, e.g. `/api/v1` (web, same origin) or `https://host/api/v1` (app). */
  baseUrl: string;
  /** `include` on the web (session cookie); the app sends a bearer header instead. */
  credentials?: RequestCredentials;
  /** Extra headers per request (client id, `Authorization`), read when the request starts. */
  headers?: () => Record<string, string>;
  /** A 401 answered a request; `path` is the request's path (without `baseUrl`). */
  onUnauthorized?: (path: string) => void;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface ApiClient {
  /** Fetches `{baseUrl}{path}` and validates the JSON body with `schema`. */
  apiFetch: <S extends z.ZodType>(
    path: string,
    schema: S,
    init?: RequestInit,
  ) => Promise<z.infer<S>>;
  /** Sends a JSON body (POST/PATCH/…) and validates the response with `schema`. */
  apiSend: <S extends z.ZodType>(
    path: string,
    schema: S,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: unknown,
  ) => Promise<z.infer<S>>;
}

/** The JSON API client both apps use; they differ only in how they authenticate. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  async function apiFetch<S extends z.ZodType>(
    path: string,
    schema: S,
    init?: RequestInit,
  ): Promise<z.infer<S>> {
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    for (const [name, value] of Object.entries(options.headers?.() ?? {})) {
      headers.set(name, value);
    }
    const doFetch = options.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}${path}`, {
        ...(options.credentials && { credentials: options.credentials }),
        ...init,
        headers,
      });
    } catch (err) {
      // An aborted request (React Query cancelling) stays an AbortError.
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new NetworkError(err);
    }
    const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) options.onUnauthorized?.(path);
      const parsed = apiErrorSchema.safeParse(body);
      const errorOptions = {
        retryAfter: parseRetryAfter(res.headers.get('retry-after')),
        fields: parsed.success ? parsed.data.error.fields : undefined,
      };
      throw parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, errorOptions)
        : new ApiError(res.status, 'HTTP_ERROR', res.statusText, errorOptions);
    }
    return schema.parse(body);
  }

  return {
    apiFetch,
    apiSend: (path, schema, method, body) =>
      apiFetch(path, schema, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
  };
}
