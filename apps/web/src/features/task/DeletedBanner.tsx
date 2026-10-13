import { useTranslation } from 'react-i18next';
import { useRestoreTask } from '../../api/tasks';
import { TrashIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { useTaskView } from './TaskContext';

/**
 * Strip under the header of a deleted task (reached from history, a link or an Undo that came
 * too late; not designed): the task is read-only until restored.
 */
export function DeletedBanner() {
  const { t } = useTranslation();
  const { task } = useTaskView();
  const restore = useRestoreTask();

  return (
    <div
      role="status"
      className="flex min-h-11 items-center gap-3 border-b border-subtle bg-subtle px-6 py-2 text-[13px] text-2"
    >
      <TrashIcon size={16} className="flex-none text-icon" />
      <p className="m-0 min-w-0 flex-1">{t('drawer.deletedBanner')}</p>
      <Button
        size="sm"
        disabled={restore.isPending}
        onClick={() => {
          restore.mutate(task);
        }}
      >
        {t('drawer.restore')}
      </Button>
    </div>
  );
}
