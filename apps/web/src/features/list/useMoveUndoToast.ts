import { isClosedCategory, type TaskListItem } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { isTempTask, useMoveTask } from '../../api/tasks';
import { toast } from '../../stores/toast';
import { placeInStatus } from './positions';

const byPosition = (a: TaskListItem, b: TaskListItem) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/**
 * After a drag that closes a task (into a Done or Cancelled status): a toast with Undo that moves it
 * back to the status and slot it came from. `statusTasksBefore` is the origin status's tasks
 * as they were before the drop (the neighbours are read from it).
 */
export function useMoveUndoToast() {
  const { t } = useTranslation();
  const move = useMoveTask();

  return (
    task: TaskListItem,
    target: TaskListItem['status'],
    statusTasksBefore: readonly TaskListItem[],
  ) => {
    if (!isClosedCategory(target.category) || target.category === task.status.category) return;
    const others = statusTasksBefore.filter((x) => x.id !== task.id && !isTempTask(x));
    const before = others.filter((x) => x.position < task.position).sort(byPosition);
    const after = others.filter((x) => x.position > task.position).sort(byPosition);
    const prevId = before.at(-1)?.id ?? null;
    const nextId = after[0]?.id ?? null;
    toast({
      message:
        target.category === 'cancelled'
          ? t('common.cancelled', { key: task.key })
          : t('common.completed', { key: task.key }),
      action: {
        label: t('common.undo'),
        onClick: () => {
          move.mutate({
            task: { ...task, status: target },
            status: task.status,
            ...placeInStatus(statusTasksBefore, task.id, prevId, nextId),
          });
        },
      },
    });
  };
}
