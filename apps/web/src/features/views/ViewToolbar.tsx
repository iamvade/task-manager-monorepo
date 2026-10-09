import { useTranslation } from 'react-i18next';
import { FilterIcon, GroupIcon, PlusIcon, SortIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { useUiStore } from '../../stores/ui';
import { GROUP_FIELDS, SORT_FIELDS, useViewParams } from './useViewParams';

/**
 * Filter (count of active filters) · Sort · Group · divider · + New Task (Main.dc.html toolbar).
 * Sort and Group write the URL; the Filter menu arrives with the List view (phase 9).
 */
export function ViewToolbar() {
  const { t } = useTranslation();
  const view = useViewParams();
  const openCreate = useUiStore((s) => s.openCreate);

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <ToolbarButton
        icon={<FilterIcon size={14} />}
        count={view.activeFilterCount}
        countLabel={t('toolbar.activeFilters', { count: view.activeFilterCount })}
      >
        {t('toolbar.filter')}
      </ToolbarButton>
      <Menu
        label={t('toolbar.sortBy')}
        items={SORT_FIELDS.map((field) => ({
          id: field,
          label: t(`toolbar.sortFields.${field}`),
          checked: field === view.sort,
          onSelect: () => {
            view.update({ sort: field === 'due' ? null : field });
          },
        }))}
        trigger={(props) => (
          <ToolbarButton {...props} icon={<SortIcon size={14} />}>
            {t('toolbar.sort', { field: t(`toolbar.sortFields.${view.sort}`) })}
          </ToolbarButton>
        )}
      />
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
      <div aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-control)]" />
      <Button
        variant="primary"
        icon={<PlusIcon size={14} strokeWidth={2.5} />}
        onClick={openCreate}
      >
        {t('toolbar.newTask')}
      </Button>
    </div>
  );
}
