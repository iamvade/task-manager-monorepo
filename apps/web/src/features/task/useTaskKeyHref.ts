import { parseTaskKey } from '@kite/shared';
import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';

/**
 * Where `APP-142` in a comment or description goes: this page with `?task=APP-142` (the drawer),
 * or null when no project of the workspace has that key (so `ISO-9001` stays text).
 */
export function useTaskKeyHref() {
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const { pathname, search } = useLocation();
  const keys = useMemo(
    () => new Set((sidebar.data?.spaces ?? []).flatMap((s) => s.projects.map((p) => p.key))),
    [sidebar.data],
  );
  return useCallback(
    (key: string): string | null => {
      const parsed = parseTaskKey(key);
      if (!parsed || !keys.has(parsed.key)) return null;
      if (pathname.startsWith('/t/')) return `/t/${key}`;
      const params = new URLSearchParams(search);
      params.set('task', key);
      params.delete('comment');
      return `${pathname}?${params.toString()}`;
    },
    [keys, pathname, search],
  );
}
