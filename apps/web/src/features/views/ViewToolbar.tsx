import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '../../api/workspaces';
import { FilterIcon, PlusIcon, SlidersIcon, SortIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { useUiStore } from '../../stores/ui';
import { FilterMenu } from './FilterMenu';
import { useCurrentView } from './useCurrentView';
import { GROUP_FIELDS, SORT_FIELDS, useViewParams } from './useViewParams';

interface ViewToolbarProps {
  /** Null on the space-level views. */
  project?: ProjectDetail | null;
  /** Project without tasks (EmptyProject.dc.html): disabled Filter, no Sort/Group. */
  empty?: boolean;
}

/**
 * Icon-only toolbar: Filter (count of active filters) · Sort · View settings (List: Group by,
 * Show empty groups, Show columns; Board: Columns by) · + New Task. Filter, Sort and Group write the URL. The
 * calendar has no Sort or View settings (Calendar.dc.html).
 */
export function ViewToolbar({ project = null, empty = false }: ViewToolbarProps) {
  const { t } = useTranslation();
  const view = useViewParams();
  const workspace = useCurrentWorkspace();
  const openCreate = useUiStore((s) => s.openCreate);
  const currentView = useCurrentView();
  const board = currentView === 'board';
  const listColumns = useUiStore((s) => s.listColumns);
  const setListColumn = useUiStore((s) => s.setListColumn);
  const showEmptyGroups = useUiStore((s) => s.showEmptyGroups);
  const setShowEmptyGroups = useUiStore((s) => s.setShowEmptyGroups);
  const newTask = () => {
    // Quick create keeps the filtered sprint while the picked project is in it; from the
    // Backlog view the new task starts in Backlog.
    const sprint = view.sprintId ? { sprintId: view.sprintId } : {};
    const status = view.show === 'backlog' ? { statusCategory: 'backlog' as const } : {};
    openCreate(
      project ? { projectId: project.id, ...sprint, ...status } : { ...sprint, ...status },
    );
  };
  const newTaskButton = (
    <Button
      variant="primary"
      aria-label={t('toolbar.newTask')}
      title={t('toolbar.newTaskHint')}
      className="w-8 px-0!"
      icon={<PlusIcon size={14} strokeWidth={2.5} />}
      onClick={newTask}
    />
  );

  if (empty) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
        <ToolbarButton
          iconOnly
          disabled
          aria-label={t('toolbar.filter')}
          icon={<FilterIcon size={14} />}
        />
        {newTaskButton}
      </div>
    );
  }

  const settingsItems: MenuItem[] = board
    ? [
        { type: 'heading', id: 'columns-by', label: t('board.columnsBy') },
        {
          id: 'status',
          label: t('toolbar.groupFields.status'),
          checked: true,
          onSelect: () => undefined,
        },
      ]
    : [
        { type: 'heading', id: 'group-by', label: t('toolbar.groupBy') },
        ...GROUP_FIELDS.map((field) => ({
          id: `group:${field}`,
          label: t(`toolbar.groupFields.${field}`),
          checked: field === view.group,
          onSelect: () => {
            view.update({ group: field === 'status' ? null : field });
          },
        })),
        { type: 'separator', id: 'sep-groups' },
        {
          id: 'empty-groups',
          label: t('toolbar.showEmptyGroups'),
          checked: showEmptyGroups,
          onSelect: () => {
            setShowEmptyGroups(!showEmptyGroups);
          },
        },
        { type: 'separator', id: 'sep' },
        { type: 'heading', id: 'columns', label: t('toolbar.columnsMenu') },
        {
          id: 'column:key',
          label: t('toolbar.columnKey'),
          checked: listColumns.key,
          onSelect: () => {
            setListColumn('key', !listColumns.key);
          },
        },
        {
          id: 'column:size',
          label: t('toolbar.columnSize'),
          checked: listColumns.size,
          onSelect: () => {
            setListColumn('size', !listColumns.size);
          },
        },
      ];

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
      <FilterMenu
        project={project}
        workspaceId={project?.workspaceId ?? workspace?.id}
        trigger={(props) => (
          <ToolbarButton
            {...props}
            iconOnly
            aria-label={t('toolbar.filter')}
            icon={<FilterIcon size={14} />}
            count={view.activeFilterCount}
            countLabel={t('toolbar.activeFilters', { count: view.activeFilterCount })}
          />
        )}
      />
      {currentView !== 'calendar' && (
        <>
          <Menu
            label={t('toolbar.sortBy')}
            items={SORT_FIELDS.map((field) => ({
              id: field,
              label: t(`toolbar.sortFields.${field}`),
              checked: field === view.sort,
              onSelect: () => {
                view.update({ sort: field === view.defaultSort ? null : field });
              },
            }))}
            trigger={(props) => (
              <ToolbarButton
                {...props}
                iconOnly
                aria-label={t('toolbar.sort', { field: t(`toolbar.sortFields.${view.sort}`) })}
                icon={<SortIcon size={14} />}
              />
            )}
          />
          <Menu
            label={t('toolbar.settings')}
            placement="bottom-end"
            items={settingsItems}
            trigger={(props) => (
              <ToolbarButton
                {...props}
                iconOnly
                aria-label={t('toolbar.settings')}
                icon={<SlidersIcon size={14} />}
              />
            )}
          />
        </>
      )}
      {newTaskButton}
    </div>
  );
}
