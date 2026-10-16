import type { StandupTaskRef } from '@kite/shared';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '../../../api/search';
import { useCurrentWorkspace } from '../../../api/workspaces';
import { Picker } from '../../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../../components/ui/Popover';
import { ProjectDot } from '../../../components/ui/ProjectDot';

/**
 * "Link a task" for a blocker: my suggested tasks first; typing searches the workspace
 * (⌘K search, tasks only).
 */
export function TaskLinkPicker({
  suggested,
  value,
  onChange,
  trigger,
}: {
  suggested: readonly StandupTaskRef[];
  value: StandupTaskRef | null;
  onChange: (task: StandupTaskRef) => void;
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
  const items = query.trim() ? found : suggested;
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
        <Picker<StandupTaskRef>
          items={items}
          value={value?.id ?? null}
          getKey={(task) => task.id}
          getLabel={(task) => `${task.key} ${task.title}`}
          query={query}
          onQueryChange={setQuery}
          search={{ placeholder: t('standup.write.searchTasks') }}
          emptyText={
            query.trim() ? t('standup.write.noTasksFound') : t('standup.write.typeToSearch')
          }
          label={t('standup.write.linkTask')}
          onSelect={onChange}
          onClose={close}
          renderItem={(task) => (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <ProjectDot color={task.project.color} size={7} />
              <span className="flex-none font-mono text-[12px] text-muted">{task.key}</span>
              <span className="truncate">{task.title}</span>
            </span>
          )}
        />
      )}
    </Popover>
  );
}
