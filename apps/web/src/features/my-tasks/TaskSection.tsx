import type { MyTask } from '@kite/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SectionId } from '../../api/homeCache';
import { PlusIcon } from '../../components/icons';
import { useUiStore } from '../../stores/ui';
import { GroupHeader } from '../list/GroupHeader';
import { MyTaskRow } from './MyTaskRow';

/** Key of the My Tasks sections in the UI store's collapsed groups. */
const LIST_ID = 'my-tasks';

interface TaskSectionProps {
  id: SectionId;
  label: string;
  hint: string;
  tasks: MyTask[];
  onToggle: (task: MyTask, done: boolean) => void;
  onAdd: () => void;
}

/**
 * A collapsible My Tasks section (MyTasks.dc.html): 40px header with chevron, label, count of
 * open tasks and a hint; then the rows and "+ Add task".
 */
export function TaskSection({ id, label, hint, tasks, onToggle, onAdd }: TaskSectionProps) {
  const { t } = useTranslation();
  const bodyId = useId();
  const collapsed = useUiStore((s) => s.collapsedGroups[LIST_ID]?.[id] ?? false);
  const setCollapsed = useUiStore((s) => s.setGroupCollapsed);

  return (
    <section aria-label={label} className="flex flex-col">
      <GroupHeader
        label={label}
        count={tasks.filter((task) => !task.done).length}
        marker={{ kind: 'none' }}
        open={!collapsed}
        onToggle={() => {
          setCollapsed(LIST_ID, id, !collapsed);
        }}
        bodyId={bodyId}
        tone={id === 'overdue' ? 'danger' : undefined}
        hint={hint}
        divided
      />
      {!collapsed && (
        <div id={bodyId} className="flex flex-col">
          <div role="table" aria-label={label}>
            {tasks.map((task) => (
              <MyTaskRow key={task.id} task={task} section={id} onToggle={onToggle} />
            ))}
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="flex h-9 items-center gap-2 border-0 bg-transparent pl-2 text-left text-[13px] text-muted hover:bg-hover"
          >
            <PlusIcon size={14} />
            {t('table.addTask')}
          </button>
        </div>
      )}
    </section>
  );
}
