import { REALTIME_CLIENT_HEADER, realtimeClientIdSchema } from '@kite/shared';
import type { FastifyRequest } from 'fastify';

/** The browser tab behind a request (`X-Kite-Client`), if it sent a well-formed id. */
export function clientIdOf(request: FastifyRequest): string | undefined {
  const parsed = realtimeClientIdSchema.safeParse(request.headers[REALTIME_CLIENT_HEADER]);
  return parsed.success ? parsed.data : undefined;
}
