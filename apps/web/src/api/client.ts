import { apiErrorSchema } from '@kite/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fetches `/api/v1{path}` and validates the JSON body with `schema`. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const res = await fetch(`/api/v1${path}`, { credentials: 'include', ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiError(res.status, 'HTTP_ERROR', res.statusText);
  }
  return schema.parse(body);
}
