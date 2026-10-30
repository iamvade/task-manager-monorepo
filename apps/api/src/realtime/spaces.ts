import type { FastifyRequest } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import { clientIdOf } from './client-id.js';

/** Tells the workspace's other tabs to refetch the sidebar (spaces, projects, their order). */
export function broadcastSpacesChanged(request: FastifyRequest, workspaceId: string): void {
  const { user } = requireAuth(request);
  request.server.realtime.broadcaster.publish({
    to: { workspaceId },
    exceptClientId: clientIdOf(request),
    message: {
      type: 'spaces.changed',
      workspaceId,
      actorId: user.id,
      at: new Date().toISOString(),
    },
  });
}
