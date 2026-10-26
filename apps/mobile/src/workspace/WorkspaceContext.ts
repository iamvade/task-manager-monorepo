import type { MeResponse } from '@kite/shared';
import { createContext, useContext } from 'react';
import { useAuth } from '../auth/useAuth';
import { useUiStore } from '../stores/ui';

export type MeWorkspace = MeResponse['workspaces'][number];

/** The workspace of the routed `/w/[slug]/...` screens. */
export const WorkspaceContext = createContext<MeWorkspace | null>(null);

/** The routed workspace; outside one, the last used if still a member, else the first. */
export function useCurrentWorkspace(): MeWorkspace | undefined {
  const routed = useContext(WorkspaceContext);
  const { me } = useAuth();
  const lastId = useUiStore((s) => s.lastWorkspaceId);
  if (routed) return routed;
  const workspaces = me?.workspaces ?? [];
  return workspaces.find((w) => w.id === lastId) ?? workspaces[0];
}
