import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Opens a task by key from anywhere: the drawer (`?task=KEY` on the current page, mounted by
 * the shell) or, on the full-page task route, that task's page. Safe to call later (toasts):
 * it reads the location at call time.
 */
export function useOpenTask() {
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useRef(location);
  useEffect(() => {
    latest.current = location;
  });

  return useCallback(
    (key: string) => {
      const { pathname, search } = latest.current;
      if (pathname.startsWith('/t/')) {
        void navigate(`/t/${key}`);
        return;
      }
      const params = new URLSearchParams(search);
      params.set('task', key);
      void navigate({ pathname, search: `?${params.toString()}` });
    },
    [navigate],
  );
}
