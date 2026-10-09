import { tagSchema } from '@kite/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './client';
import { queryKeys } from './queryKeys';

/** Workspace tags, by name (tag picker, filter menu). */
export function useTags(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tags(workspaceId ?? ''),
    queryFn: () => apiFetch(`/workspaces/${workspaceId ?? ''}/tags`, z.array(tagSchema)),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}
