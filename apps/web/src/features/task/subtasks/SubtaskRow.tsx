import type { Subtask, UserRef } from '@kite/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isTempSubtask, useDeleteSubtask, useUpdateSubtask } from '../../../api/subtasks';
import { CalendarIcon, MoreIcon, TrashIcon, UserPlusIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Checkbox } from '../../../components/ui/Checkbox';
import { IconButton } from '../../../components/ui/IconButton';
import { Menu } from '../../../components/ui/Menu';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { AssigneePicker } from '../../pickers/AssigneePicker';
import { DuePicker } from '../../pickers/DuePicker';
import { useTaskView } from '../TaskContext';

type Listener<E> = ((event: E) => void) | undefined;

/**
 * 40px subtask row (TaskDetail.dc.html): checkbox, title (done → muted strike-through; click to
 * rename), due date while open, 22px assignee avatar, and a "…" menu on hover. The row is the
 * drag handle (pointer, or Space when the row itself is focused).
 */
export function SubtaskRow({ subtask }: { subtask: Subtask }) {
  const { t } = useTranslation();
  const { task, members, teamIds } = useTaskView();
  const dates = useDates();
  const update = useUpdateSubtask();
  const remove = useDeleteSubtask();
  const [editing, setEditing] = useState<string | null>(null);
  const temp = isTempSubtask(subtask);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
    disabled: temp || editing !== null,
  });
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLDivElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLDivElement>>;
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => {
    update.mutate({ taskId: task.id, subtaskId: subtask.id, patch: p });
  };

  function saveTitle() {
    const title = editing?.trim();
    setEditing(null);
    if (title && title !== subtask.title) patch({ title });
  }

  function setAssignee(users: UserRef[]) {
    const next = users.find((u) => u.id !== subtask.assignee?.id) ?? null;
    if ((next?.id ?? null) !== (subtask.assignee?.id ?? null)) patch({ assignee: next });
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      aria-label={subtask.title}
      onPointerDown={(e) => {
        if (e.currentTarget.contains(e.target as Node)) onPointerDown?.(e);
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget) onKeyDown?.(e);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/sub relative flex h-10 items-center gap-2.5 border-b border-subtle bg-surface px-3 outline-none hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent-ink)]',
        isDragging && 'z-[1] opacity-60 shadow-drag',
      )}
    >
      <Checkbox
        checked={subtask.done}
        disabled={temp}
        label={subtask.title}
        onChange={(done) => {
          patch({ done });
        }}
        className="flex-none"
      />
      {editing !== null ? (
        <input
          autoFocus
          value={editing}
          aria-label={t('drawer.renameSubtask')}
          maxLength={500}
          onChange={(e) => {
            setEditing(e.target.value);
          }}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveTitle();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(null);
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-[6px] border border-control bg-control px-1.5 text-[14px] outline-none focus-visible:outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={temp}
          onClick={() => {
            setEditing(subtask.title);
          }}
          className={cn(
            'min-w-0 flex-1 cursor-text truncate border-0 bg-transparent p-0 text-left text-[14px]',
            subtask.done ? 'text-muted line-through' : 'text-default',
          )}
        >
          {subtask.title}
        </button>
      )}

      {!subtask.done && !temp && (
        <DuePicker
          label={t('drawer.subtaskDue')}
          value={subtask.dueDate}
          onChange={(dueDate) => {
            if (dueDate !== subtask.dueDate) patch({ dueDate });
          }}
          trigger={(props, open) =>
            subtask.dueDate ? (
              <button
                type="button"
                {...props}
                aria-label={t('drawer.subtaskDue')}
                className={cn(
                  'h-6 flex-none rounded-[6px] border-0 px-1.5 text-[12px] hover:bg-hover',
                  open ? 'bg-hover' : 'bg-transparent',
                  dates.dueTone(subtask.dueDate) === 'overdue' ? 'text-due-overdue' : 'text-3',
                )}
              >
                {dates.formatDue(subtask.dueDate)}
              </button>
            ) : (
              <IconButton
                {...props}
                label={t('drawer.subtaskDue')}
                size={24}
                icon={<CalendarIcon size={14} />}
                className={cn(
                  'text-faint opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100',
                  open && 'opacity-100',
                )}
              />
            )
          }
        />
      )}

      {!temp && (
        <AssigneePicker
          label={t('drawer.subtaskAssignee')}
          value={subtask.assignee ? [subtask.assignee] : []}
          members={members}
          teamIds={teamIds}
          onChange={setAssignee}
          trigger={(props, open) => (
            <button
              type="button"
              {...props}
              aria-label={t('drawer.subtaskAssignee')}
              title={subtask.assignee?.name ?? t('table.noAssignee')}
              className={cn(
                'flex size-[22px] flex-none items-center justify-center rounded-full border-0 bg-transparent p-0',
                !subtask.assignee &&
                  'border border-dashed border-strong text-faint opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100',
                !subtask.assignee && open && 'opacity-100',
              )}
            >
              {subtask.assignee ? (
                <Avatar user={subtask.assignee} size={22} title={null} />
              ) : (
                <UserPlusIcon size={12} />
              )}
            </button>
          )}
        />
      )}

      {!temp && (
        <Menu
          label={t('drawer.subtaskOptions')}
          placement="bottom-end"
          width={180}
          items={[
            {
              id: 'delete',
              label: t('table.delete'),
              icon: <TrashIcon size={14} />,
              danger: true,
              onSelect: () => {
                remove.mutate({ taskId: task.id, subtaskId: subtask.id });
              },
            },
          ]}
          trigger={(props, open) => (
            <IconButton
              {...props}
              label={t('drawer.subtaskOptions')}
              size={24}
              icon={<MoreIcon size={14} />}
              className={cn(
                'opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100',
                open && 'bg-hover opacity-100',
              )}
            />
          )}
        />
      )}
    </div>
  );
}
