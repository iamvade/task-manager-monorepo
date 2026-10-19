import type { ReportSprintRef } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, CycleIcon } from '../../../components/icons';
import { Picker } from '../../../components/ui/Picker';
import { Popover } from '../../../components/ui/Popover';
import { sprintLabel } from '../../../lib/sprint';
import { useDates } from '../../../lib/useDates';

interface SprintSelectProps {
  /** Newest first. */
  sprints: readonly ReportSprintRef[];
  value: ReportSprintRef;
  onChange: (sprintId: string) => void;
}

/** "Current" pill: 18px, success-soft, 11/600. */
export function CurrentPill() {
  const { t } = useTranslation();
  return (
    <span className="flex h-[18px] items-center rounded-full bg-success-soft px-1.5 text-[11px] font-semibold text-success-soft">
      {t('reports.sprints.current')}
    </span>
  );
}

/**
 * Sprint selector (ReportsSprints.dc.html toolbar): 32px outline button with ↻, the sprint name
 * (600), its range and a "Current" pill; a 288px listbox of the sprints in scope, newest first
 * (project keys under the name when a sprint is shared by several projects).
 */
export function SprintSelect({ sprints, value, onChange }: SprintSelectProps) {
  const { t } = useTranslation();
  const { formatRange } = useDates();
  const label = t('reports.sprints.selectLabel');
  return (
    <Popover
      label={label}
      width={288}
      elevation="lg"
      placement="bottom-end"
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${sprintLabel(t, value)}`}
          className="flex h-8 max-w-full items-center gap-2 rounded-[8px] border border-control bg-control px-2.5 text-[13px] text-default hover:bg-hover"
        >
          <CycleIcon size={14} className="flex-none text-3" />
          <span className="font-semibold whitespace-nowrap">{sprintLabel(t, value)}</span>
          <span className="truncate text-muted">{formatRange(value.startDate, value.endDate)}</span>
          {value.current && <CurrentPill />}
          <ChevronDownIcon size={12} className="flex-none text-icon" />
        </button>
      )}
    >
      {(close) => (
        <Picker<ReportSprintRef>
          items={sprints}
          value={value.id}
          getKey={(s) => s.id}
          getLabel={(s) => sprintLabel(t, s)}
          label={label}
          onSelect={(s) => {
            onChange(s.id);
          }}
          onClose={close}
          renderItem={(s) => (
            <>
              <span className="flex min-w-[72px] flex-col">
                <span className="font-semibold">{sprintLabel(t, s)}</span>
                {s.projects.length > 1 && (
                  <span className="truncate text-[11px] text-muted">
                    {s.projects.map((p) => p.key).join(' · ')}
                  </span>
                )}
              </span>
              <span className="flex-1 truncate text-muted">
                {formatRange(s.startDate, s.endDate)}
              </span>
              {s.current && (
                <span className="text-[11px] font-semibold text-success-soft">
                  {t('reports.sprints.current')}
                </span>
              )}
            </>
          )}
        />
      )}
    </Popover>
  );
}
