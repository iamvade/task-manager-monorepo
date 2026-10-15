import { REALTIME_CLIENT_HEADER, apiErrorSchema } from '@kite/shared';
import type { z } from 'zod';
import { CLIENT_ID } from '../realtime/clientId';
import { apiUrl } from '../lib/basePath';

export class ApiError extends Error {
  /** Seconds to wait, from a 429's `Retry-After` header. */
  readonly retryAfter: number | undefined;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: { retryAfter?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.retryAfter = options.retryAfter;
  }
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

/** Fetches `/api/v1{path}` (under the base path) and validates the JSON body with `schema`. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  headers.set(REALTIME_CLIENT_HEADER, CLIENT_ID);
  const res = await fetch(apiUrl(path), { credentials: 'include', ...init, headers });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    const options = { retryAfter: parseRetryAfter(res.headers.get('retry-after')) };
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, options)
      : new ApiError(res.status, 'HTTP_ERROR', res.statusText, options);
  }
  return schema.parse(body);
}

/** Sends a JSON body (POST/PATCH/…) and validates the response with `schema`. */
export function apiSend<S extends z.ZodType>(
  path: string,
  schema: S,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<z.infer<S>> {
  return apiFetch(path, schema, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}
