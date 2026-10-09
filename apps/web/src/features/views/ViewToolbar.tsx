import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '../../api/workspaces';
import { ColumnsIcon, FilterIcon, GroupIcon, PlusIcon, SortIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
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
 * Filter (count of active filters) · Sort · Group · divider · + New Task (Main.dc.html toolbar).
 * Filter, Sort and Group write the URL.
 */
export function ViewToolbar({ project = null, empty = false }: ViewToolbarProps) {
  const { t } = useTranslation();
  const view = useViewParams();
  const workspace = useCurrentWorkspace();
  const openCreate = useUiStore((s) => s.openCreate);
  const board = useCurrentView() === 'board';
  const newTask = () => {
    openCreate(
      project
        ? { projectId: project.id, ...(view.sprintId ? { sprintId: view.sprintId } : {}) }
        : {},
    );
  };

  if (empty) {
    return (
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <button
          type="button"
          disabled
          className="h-8 cursor-not-allowed rounded-[8px] border border-subtle bg-control px-2.5 text-[13px] text-faint"
        >
          {t('toolbar.filter')}
        </button>
        <div aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-control)]" />
        <Button variant="primary" icon={<PlusIcon size={14} strokeWidth={2.5} />} onClick={newTask}>
          {t('toolbar.newTask')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <FilterMenu
        project={project}
        workspaceId={project?.workspaceId ?? workspace?.id}
        trigger={(props) => (
          <ToolbarButton
            {...props}
            icon={<FilterIcon size={14} />}
            count={view.activeFilterCount}
            countLabel={t('toolbar.activeFilters', { count: view.activeFilterCount })}
          >
            {t('toolbar.filter')}
          </ToolbarButton>
        )}
      />
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
          <ToolbarButton {...props} icon={<SortIcon size={14} />}>
            {t('toolbar.sort', { field: t(`toolbar.sortFields.${view.sort}`) })}
          </ToolbarButton>
        )}
      />
      {board ? (
        <Menu
          label={t('board.columnsBy')}
          items={[
            {
              id: 'status',
              label: t('toolbar.groupFields.status'),
              checked: true,
              onSelect: () => undefined,
            },
          ]}
          trigger={(props) => (
            <ToolbarButton {...props} icon={<ColumnsIcon size={14} />}>
              {t('board.columnsStatus')}
            </ToolbarButton>
          )}
        />
      ) : (
        <Menu
          label={t('toolbar.groupBy')}
          items={GROUP_FIELDS.map((field) => ({
            id: field,
            label: t(`toolbar.groupFields.${field}`),
            checked: field === view.group,
            onSelect: () => {
              view.update({ group: field === 'status' ? null : field });
            },
          }))}
          trigger={(props) => (
            <ToolbarButton {...props} icon={<GroupIcon size={14} />}>
              {t('toolbar.group', { field: t(`toolbar.groupFields.${view.group}`) })}
            </ToolbarButton>
          )}
        />
      )}
      <div aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-control)]" />
      <Button variant="primary" icon={<PlusIcon size={14} strokeWidth={2.5} />} onClick={newTask}>
        {t('toolbar.newTask')}
      </Button>
    </div>
  );
}
