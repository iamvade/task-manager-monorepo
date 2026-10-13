import { Suspense, lazy, useCallback } from 'react';
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
 * history entry). Not shown on the
 * task's full page (`/t/:key`).
 */
export function TaskDrawer() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const onTaskPage = useMatch('/t/:taskKey');
  const key = params.get('task');

  const close = useCallback(() => {
    // Replace, not push: Back after closing goes to the previous screen, not back into the
    // drawer (opening still pushes, so Back from an open drawer closes it).
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  if (!key || onTaskPage) return null;
  return (
    <Drawer open onClose={close} label={t('drawer.dialogLabel', { key })}>
      <Suspense fallback={null}>
        <TaskDetailView key={key} taskKey={key} layout="drawer" onClose={close} />
      </Suspense>
    </Drawer>
  );
}
