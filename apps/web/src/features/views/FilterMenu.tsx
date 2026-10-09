import { addDays, startOfWeek, type ProjectDetail } from '@kite/shared';
import { ChevronLeft } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from '../../components/icons';
import { CountBadge } from '../../components/ui/CountBadge';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { useDates } from '../../lib/useDates';
import { useFilterOptions, type FilterOption } from './filterOptions';
import { NO_SPRINT, useViewParams, type FilterField, type ViewFilters } from './useViewParams';

interface FilterMenuProps {
  /** Null on the space list (status categories, no sprints). */
  project: ProjectDetail | null;
  workspaceId: string | undefined;
  trigger: (props: TriggerProps, open: boolean) => ReactElement;
}

type ListField = 'status' | 'assignee' | 'priority' | 'tag';

const optionRow =
  'flex h-8 w-full items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-[13px] text-default hover:bg-popover-hover focus-visible:bg-popover-hover';

/** Count of values a field filters on (the badge next to it in the menu). */
function fieldCount(field: FilterField, filters: ViewFilters): number {
  switch (field) {
    case 'sprint':
      return filters.sprint ? 1 : 0;
    case 'due':
      return filters.dueFrom || filters.dueTo ? 1 : 0;
    default:
      return filters[field].length;
  }
}

/**
 * Filter menu (not designed; menu language from design-notes 2.5): a list of fields, each
 * opening a multi-select picker (status, assignee incl. me/unassigned, priority, tags), the
 * sprint list or due-date presets + range. Every change writes the URL.
 */
export function FilterMenu({ project, workspaceId, trigger }: FilterMenuProps) {
  const { t } = useTranslation();
  const view = useViewParams();
  const options = useFilterOptions(project, workspaceId);
  const [field, setField] = useState<FilterField | null>(null);
  const fields: FilterField[] = [
    'status',
    'assignee',
    'priority',
    'tag',
    ...(project ? (['sprint'] as const) : []),
    'due',
  ];

  function toggle(name: ListField, key: string) {
    const current: string[] = view.filters[name];
    view.update({
      [name]: current.includes(key) ? current.filter((v) => v !== key) : [...current, key],
    });
  }

  function clearAll() {
    view.update({
      status: null,
      assignee: null,
      priority: null,
      tag: null,
      dueFrom: null,
      dueTo: null,
      // Keeps the default sprint filter from coming back.
      sprint: project?.activeSprint ? NO_SPRINT : null,
    });
  }

  return (
    <Popover
      trigger={trigger}
      label={t('toolbar.filter')}
      width={264}
      onOpenChange={(open) => {
        if (!open) setField(null);
      }}
    >
      {field === null ? (
        <div className="flex flex-col">
          {fields.map((name) => {
            const count = fieldCount(name, view.filters);
            return (
              <button
                key={name}
                type="button"
                className={optionRow}
                onClick={() => {
                  setField(name);
                }}
              >
                <span className="flex-1 truncate">{t(`filters.fields.${name}`)}</span>
                {count > 0 && <CountBadge value={count} tone="accentSoft" />}
                <ChevronRightIcon size={14} className="text-icon" />
              </button>
            );
          })}
          {view.activeFilterCount > 0 && (
            <>
              <div role="separator" className="my-1 h-px bg-surface-2" />
              <button type="button" className={optionRow} onClick={clearAll}>
                {t('filters.clearAll')}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          <button
            type="button"
            className={`${optionRow} font-medium text-muted`}
            aria-label={t('filters.back')}
            onClick={() => {
              setField(null);
            }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            {t(`filters.fields.${field}`)}
          </button>
          <div role="separator" className="my-1 h-px bg-surface-2" />
          {field === 'due' ? (
            <DueFilter />
          ) : field === 'sprint' ? (
            <OptionPicker
              items={options.sprint}
              value={view.filters.sprint}
              label={t('filters.fields.sprint')}
              emptyText={t('filters.noSprints')}
              onSelect={(o) => {
                view.update({ sprint: o.key === view.filters.sprint ? NO_SPRINT : o.key });
              }}
            />
          ) : (
            <OptionPicker
              items={options[field]}
              value={view.filters[field]}
              multiple
              label={t(`filters.fields.${field}`)}
              search={
                field === 'assignee'
                  ? t('filters.searchPeople')
                  : field === 'tag'
                    ? t('filters.searchTags')
                    : undefined
              }
              onSelect={(o) => {
                toggle(field, o.key);
              }}
            />
          )}
        </div>
      )}
    </Popover>
  );
}

function OptionPicker({
  items,
  value,
  multiple,
  label,
  search,
  emptyText,
  onSelect,
}: {
  items: FilterOption[];
  value: string | readonly string[] | null;
  multiple?: boolean;
  label: string;
  search?: string;
  emptyText?: string;
  onSelect: (option: FilterOption) => void;
}) {
  return (
    <Picker
      items={items}
      value={value}
      multiple={multiple}
      getKey={(o) => o.key}
      getLabel={(o) => o.label}
      label={label}
      emptyText={emptyText}
      search={search ? { placeholder: search } : undefined}
      onSelect={onSelect}
      renderItem={(o) => o.content ?? <span className="truncate">{o.label}</span>}
    />
  );
}

/** Due presets (Overdue, Due today, This week, Next week) + a from/to range. */
function DueFilter() {
  const { t } = useTranslation();
  const dates = useDates();
  const view = useViewParams();
  const { dueFrom, dueTo } = view.filters;
  const today = dates.today;
  const monday = startOfWeek(today);
  const presets = [
    { key: 'overdue', label: t('filters.duePresets.overdue'), from: null, to: addDays(today, -1) },
    { key: 'today', label: t('filters.duePresets.today'), from: today, to: today },
    {
      key: 'thisWeek',
      label: t('filters.duePresets.thisWeek'),
      from: monday,
      to: addDays(monday, 6),
    },
    {
      key: 'nextWeek',
      label: t('filters.duePresets.nextWeek'),
      from: addDays(monday, 7),
      to: addDays(monday, 13),
    },
  ];
  const selected = presets.find((p) => p.from === dueFrom && p.to === dueTo)?.key ?? null;
  const input =
    'h-8 min-w-0 flex-1 rounded-[8px] border border-control bg-control px-2 text-[13px] text-default';

  return (
    <div className="flex flex-col">
      <Picker
        items={presets}
        value={selected}
        getKey={(p) => p.key}
        getLabel={(p) => p.label}
        label={t('filters.fields.due')}
        onSelect={(p) => {
          const on = p.key === selected;
          view.update({ dueFrom: on ? null : p.from, dueTo: on ? null : p.to });
        }}
      />
      <div role="separator" className="my-1 h-px bg-surface-2" />
      <div className="flex flex-col gap-2 px-2 py-1.5">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <span className="w-12 flex-none">{t('filters.dueFrom')}</span>
          <input
            type="date"
            value={dueFrom ?? ''}
            max={dueTo ?? undefined}
            onChange={(e) => {
              view.update({ dueFrom: e.target.value || null });
            }}
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <span className="w-12 flex-none">{t('filters.dueTo')}</span>
          <input
            type="date"
            value={dueTo ?? ''}
            min={dueFrom ?? undefined}
            onChange={(e) => {
              view.update({ dueTo: e.target.value || null });
            }}
            className={input}
          />
        </label>
      </div>
    </div>
  );
}
