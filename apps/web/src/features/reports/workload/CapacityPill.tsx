import type { WorkloadLoad } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';

const STYLE: Record<WorkloadLoad, { pill: string; dot: string }> = {
  heavy: { pill: 'bg-warning-soft text-warning-soft', dot: 'var(--load-heavy-dot)' },
  balanced: { pill: 'bg-chip text-2', dot: 'var(--load-balanced-dot)' },
  light: { pill: 'bg-success-soft text-success-soft', dot: 'var(--load-light-dot)' },
};

/**
 * Heavy / Balanced / Light pill (22px, radius 11, 12/500, 6px dot); "Away until Oct 20" (neutral)
 * while the person is out of office.
 */
export function CapacityPill({
  load,
  capacity,
  awayUntil,
}: {
  load: WorkloadLoad;
  capacity: number;
  /** Set (and in the future) while out of office: shown instead of the load. */
  awayUntil?: string | null;
}) {
  const { t } = useTranslation();
  const { formatDate } = useDates();
  const style = STYLE[load];
  if (awayUntil) {
    return (
      <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[11px] border border-dashed border-strong px-2 text-[12px] font-medium whitespace-nowrap text-2">
        {t('picker.awayUntil', { date: formatDate(awayUntil) })}
      </span>
    );
  }
  return (
    <span
      title={t('reports.workload.capTitle', { count: capacity })}
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-[11px] px-2 text-[12px] font-medium whitespace-nowrap',
        style.pill,
      )}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ background: style.dot }}
      />
      {t(`reports.workload.load.${load}`)}
    </span>
  );
}
