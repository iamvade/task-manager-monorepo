import type { FeedbackTaskRef } from '@kite/shared';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '../../api/search';
import { useCurrentWorkspace } from '../../api/workspaces';
import { Avatar } from '../../components/ui/Avatar';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { StatusDot } from '../../components/ui/StatusDot';

export type PickableTask = Pick<
  FeedbackTaskRef,
  'id' | 'key' | 'title' | 'project' | 'status' | 'assignees'
>;

interface TaskSearchListProps {
  /** Shown under "Similar tasks" before anything is typed. */
  suggested?: readonly PickableTask[];
  onPick: (task: PickableTask) => void;
  onClose?: () => void;
  /** Leave this task out (already linked). */
  excludeId?: string | null;
}

/**
 * Searchable task list (FeedbackDetail.dc.html "picker"): name or key (`APP-…`) through the ⌘K
 * search; similar tasks before typing. ↑↓ move, ↵ links, Esc closes (the footer says so).
 */
export function TaskSearchList({
  suggested = [],
  onPick,
  onClose,
  excludeId,
}: TaskSearchListProps) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [query, setQuery] = useState('');
  const search = useSearch(workspace?.id, query);
  const typed = query.trim() !== '';
  const items = (typed ? (search.data?.pages[0]?.tasks ?? []) : suggested).filter(
    (task) => task.id !== excludeId,
  );
  return (
    <Picker<PickableTask>
      items={items}
      value={null}
      getKey={(task) => task.id}
      getLabel={(task) => `${task.key} ${task.title}`}
      query={query}
      onQueryChange={setQuery}
      search={{ placeholder: t('feedback.picker.search') }}
      groupBy={typed ? undefined : () => t('feedback.picker.similar')}
      emptyText={
        typed || search.isFetching
          ? t('feedback.picker.noMatch')
          : t('feedback.picker.typeToSearch')
      }
      label={t('feedback.picker.label')}
      footerHints
      onSelect={onPick}
      onClose={onClose}
      tall
      renderItem={(task) => {
        const status = task.status.name ?? t(`status.${task.status.category}`);
        const assignee = task.assignees[0];
        return (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{task.title}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="font-mono">{task.key}</span>·
                <StatusDot category={task.status.category} size={8} />
                <span className="truncate">{status}</span>
              </span>
            </span>
            {assignee && <Avatar user={assignee} size={20} textSize={9} />}
          </span>
        );
      }}
    />
  );
}

/** `TaskSearchList` in a popover (bulk "Link to task"). */
export function TaskPickerPopover({
  trigger,
  onPick,
}: {
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
  onPick: (task: PickableTask) => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover trigger={trigger} label={t('feedback.picker.label')} width={360} elevation="lg">
      {(close) => (
        <TaskSearchList
          onPick={(task) => {
            onPick(task);
            close();
          }}
          onClose={close}
        />
      )}
    </Popover>
  );
}
