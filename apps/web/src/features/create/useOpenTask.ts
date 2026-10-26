import { appPath } from '@kite/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useWsPath } from '../../api/workspaces';

/**
 * Opens a task by key from anywhere: the drawer (`?task=KEY` on the current page, mounted by
 * the shell) or, on the full-page task route, that task's page. Safe to call later (toasts):
 * it reads the location at call time.
 */
export function useOpenTask() {
  const ws = useWsPath();
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useRef(location);
  useEffect(() => {
    latest.current = location;
  });

  return useCallback(
    /** `commentId`: the drawer scrolls to that comment (⌘K comment hits). */
    (key: string, commentId?: string) => {
      const { pathname, search } = latest.current;
      if (appPath(pathname).startsWith('/t/')) {
        void navigate(ws(`/t/${key}${commentId ? `?comment=${commentId}` : ''}`));
        return;
      }
      const params = new URLSearchParams(search);
      params.set('task', key);
      if (commentId) params.set('comment', commentId);
      else params.delete('comment');
      void navigate({ pathname, search: `?${params.toString()}` });
    },
    [navigate, ws],
  );
}
