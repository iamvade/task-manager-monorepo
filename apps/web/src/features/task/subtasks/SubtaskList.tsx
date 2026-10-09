import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isTempSubtask, useCreateSubtask, useMoveSubtask } from '../../../api/subtasks';
import { PlusIcon } from '../../../components/icons';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { useTaskView } from '../TaskContext';
import { SubtaskRow } from './SubtaskRow';

/** Inline "Add subtask" row: Enter adds at the end and keeps focus; Esc clears. */
function AddSubtask({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const create = useCreateSubtask();
  const [title, setTitle] = useState('');

  return (
    <label className="flex h-10 items-center gap-2.5 px-3 text-muted">
      <PlusIcon size={16} />
      <span className="sr-only">{t('drawer.newSubtask')}</span>
      <input
        type="text"
        value={title}
        maxLength={500}
        placeholder={t('drawer.addSubtask')}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const value = title.trim();
            if (!value) return;
            create.mutate({ taskId, title: value, tempId: `temp-${crypto.randomUUID()}` });
            setTitle('');
          } else if (e.key === 'Escape' && title) {
            e.preventDefault();
            e.stopPropagation();
            setTitle('');
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-default outline-none placeholder:text-muted focus-visible:outline-none"
      />
    </label>
  );
}

/**
 * Subtasks (TaskDetail.dc.html): "Subtasks 5/6" + progress bar (accent, green at 100%), a
 * bordered list of rows sortable by drag (pointer or keyboard), and the add row.
 */
export function SubtaskList() {
  const { t } = useTranslation();
  const { task } = useTaskView();
  const move = useMoveSubtask();
  const subtasks = task.subtasks;
  const done = subtasks.filter((s) => s.done).length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = subtasks.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const order = arrayMove(ids, from, to).filter((id) => !id.startsWith('temp-'));
    const index = order.indexOf(String(active.id));
    move.mutate({
      taskId: task.id,
      subtaskId: String(active.id),
      prevId: order[index - 1] ?? null,
      nextId: order[index + 1] ?? null,
    });
  }

  return (
    <section aria-labelledby="sub-h" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h3 id="sub-h" className="m-0 text-[13px] font-semibold text-2">
          {t('drawer.subtasks')}
        </h3>
        {subtasks.length > 0 && (
          <>
            <span className="text-[12px] text-muted">
              {done}/{subtasks.length}
            </span>
            <ProgressBar done={done} total={subtasks.length} />
          </>
        )}
      </div>
      <div className="flex flex-col overflow-hidden rounded-[10px] border border-default">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={subtasks.filter((s) => !isTempSubtask(s)).map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {subtasks.map((subtask) => (
              <SubtaskRow key={subtask.id} subtask={subtask} />
            ))}
          </SortableContext>
        </DndContext>
        <AddSubtask taskId={task.id} />
      </div>
    </section>
  );
}
