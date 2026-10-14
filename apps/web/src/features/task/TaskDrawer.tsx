import { Suspense, lazy, useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useSearchParams } from 'react-router';
import { Drawer } from '../../components/ui/Drawer';
import { loadTaskDetailView } from './loadTaskDetailView';

const TaskDetailView = lazy(() =>
  loadTaskDetailView().then((m) => ({ default: m.TaskDetailView })),
);

/**
 * Task drawer opened by `?task=APP-142` over any page (TaskDetail.dc.html): 40% wide (min
 * 520px) from the right over a scrim; Esc, the scrim or × removes the param (replacing the
 * history entry). Not shown on the task's full page (`/t/:key`). Closing returns focus to
 * the row, card or link that opened it.
 */
export function TaskDrawer() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const onTaskPage = useMatch('/t/:taskKey');
  const key = params.get('task');

  // The element focused when the drawer opened (a list row, a card…) and the last key shown.
  const opener = useRef<HTMLElement | null>(null);
  const lastKey = useRef<string | null>(null);
  const prevKey = useRef<string | null>(null);
  // Layout effect: on open, before the focus manager moves focus into the panel (a frame
  // later); on close, after the panel is gone. Not an unmount cleanup: StrictMode's simulated
  // unmount would steal focus back from the panel in development.
  useLayoutEffect(() => {
    if (key && !prevKey.current) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    if (!key && prevKey.current) {
      // Back to the opener; if it re-rendered (realtime patch, regrouping), find the row/card
      // by task key; else the page.
      const k = lastKey.current;
      const target =
        (opener.current?.isConnected ? opener.current : null) ??
        (k ? document.querySelector<HTMLElement>(`[data-task-key="${CSS.escape(k)}"]`) : null) ??
        document.getElementById('main');
      target?.focus({ preventScroll: true });
    }
    if (key) lastKey.current = key;
    prevKey.current = key;
  }, [key]);

  const close = useCallback(() => {
    // Replace, not push: Back after closing goes to the previous screen, not back into the
    // drawer (opening still pushes, so Back from an open drawer closes it).
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        next.delete('comment');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  if (!key || onTaskPage) return null;
  return (
    <Drawer open onClose={close} label={t('drawer.dialogLabel', { key })} contentKey={key}>
      <Suspense fallback={null}>
        <TaskDetailView key={key} taskKey={key} layout="drawer" onClose={close} />
      </Suspense>
    </Drawer>
  );
}
