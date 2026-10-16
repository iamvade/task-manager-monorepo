import type { StandupTaskRef } from '@kite/shared';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '../../../api/search';
import { useCurrentWorkspace } from '../../../api/workspaces';
import { Picker } from '../../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../../components/ui/Popover';
import { ProjectDot } from '../../../components/ui/ProjectDot';

/** `null` = the "Remove link" row. */
type Item = StandupTaskRef | null;
const NONE = 'none';

/**
 * "Link a task" for a blocker: my suggested tasks first; typing searches the workspace
 * (⌘K search, tasks only). With `onClear`, a linked task can be removed from the list too
 * (the phone layout has no × chip).
 */
export function TaskLinkPicker({
  suggested,
  value,
  onChange,
  onClear,
  trigger,
}: {
  suggested: readonly StandupTaskRef[];
  value: StandupTaskRef | null;
  onChange: (task: StandupTaskRef) => void;
  onClear?: () => void;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
}) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [query, setQuery] = useState('');
  const search = useSearch(workspace?.id, query);
  const found: StandupTaskRef[] = (search.data?.pages[0]?.tasks ?? []).map((task) => ({
    id: task.id,
    key: task.key,
    title: task.title,
    project: {
      id: task.project.id,
      key: task.project.key,
      name: task.project.name,
      color: task.project.color,
    },
    statusCategory: task.status.category,
  }));
  const tasks = query.trim() ? found : suggested;
  const items: readonly Item[] = value && onClear && !query.trim() ? [...tasks, null] : tasks;
  return (
    <Popover
      trigger={trigger}
      label={t('standup.write.linkTask')}
      width={320}
      elevation="lg"
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
      {(close) => (
        <Picker<Item>
          items={items}
          value={value?.id ?? null}
          getKey={(task) => task?.id ?? NONE}
          getLabel={(task) => (task ? `${task.key} ${task.title}` : t('standup.write.unlink'))}
          query={query}
          onQueryChange={setQuery}
          search={{ placeholder: t('standup.write.searchTasks') }}
          emptyText={
            query.trim() ? t('standup.write.noTasksFound') : t('standup.write.typeToSearch')
          }
          label={t('standup.write.linkTask')}
          onSelect={(task) => {
            if (task) onChange(task);
            else onClear?.();
          }}
          onClose={close}
          renderItem={(task) =>
            task === null ? (
              <span className="flex-1 text-muted">{t('standup.write.unlink')}</span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <ProjectDot color={task.project.color} size={7} />
                <span className="flex-none font-mono text-[12px] text-muted">{task.key}</span>
                <span className="truncate">{task.title}</span>
              </span>
            )
          }
        />
      )}
    </Popover>
  );
}
