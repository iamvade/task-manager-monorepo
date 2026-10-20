import type { FastifyRequest } from 'fastify';
import { httpError } from '../errors.js';
import { requireAuth, type AuthContext } from './plugin.js';

/** The platform admin (`users.platform_role = 'vade'`). Anyone else gets 404: the area isn't confirmed. */
export function requireVade(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request);
  if (auth.user.platformRole !== 'vade') throw httpError(404, 'NOT_FOUND', 'Not found');
  return auth;
}
