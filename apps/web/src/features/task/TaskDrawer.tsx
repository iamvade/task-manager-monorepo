import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useSearchParams } from 'react-router';
import { Drawer } from '../../components/ui/Drawer';
import { TaskDetailView } from './TaskDetailView';

/**
 * Task drawer opened by `?task=APP-142` over any page (TaskDetail.dc.html): 40% wide (min
 * 520px) from the right over a scrim; Esc, the scrim or × removes the param. Not shown on the
 * task's full page (`/t/:key`).
 */
export function TaskDrawer() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const onTaskPage = useMatch('/t/:taskKey');
  const key = params.get('task');

  const close = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    });
  }, [setParams]);

  if (!key || onTaskPage) return null;
  return (
    <Drawer open onClose={close} label={t('drawer.dialogLabel', { key })}>
      <TaskDetailView key={key} taskKey={key} layout="drawer" onClose={close} />
    </Drawer>
  );
}
