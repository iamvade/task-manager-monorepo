import type { TaskListItem } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useDeleteTask, useRestoreTask } from '../../api/tasks';
import { toast } from '../../stores/toast';

/**
 * Deletes a task without asking first and offers Undo in a toast (the delete is a soft delete,
 * so Undo is a restore). Shared by the List row menu and the drawer header. Errors toast from
 * the mutation cache.
 */
export function useDeleteWithUndo() {
  const { t } = useTranslation();
  const remove = useDeleteTask();
  const restore = useRestoreTask();
  const failed = () => undefined;

  return (task: TaskListItem) => {
    const { key } = task;
    // Promises, not per-call callbacks: the caller (a drawer, a row) may unmount before the
    // server answers.
    remove
      .mutateAsync(task)
      .then(() => {
        toast({
          message: t('drawer.deleted', { key }),
          action: {
            label: t('common.undo'),
            onClick: () => {
              restore.mutateAsync(task).catch(failed);
            },
          },
        });
      })
      .catch(failed);
  };
}
