import { useTranslation } from 'react-i18next';
import { ArrowDownIcon, ArrowUpIcon } from '../../../components/icons';
import { cn } from '../../../lib/cn';
import type { DeltaDirection, DeltaTone } from '../delta';

const TONES: Record<DeltaTone, string> = {
  good: 'bg-success-soft text-success-soft',
  bad: 'bg-danger-soft text-danger-soft',
  neutral: 'bg-chip text-chip',
};

/** "↑ 12%" chip (Reports.dc.html): 20px, radius 6, 12/600, 12px arrow; green when it improved. */
export function DeltaChip({
  value,
  direction,
  tone,
}: {
  value: string;
  direction: DeltaDirection;
  tone: DeltaTone;
}) {
  const { t } = useTranslation();
  const Arrow = direction === 'up' ? ArrowUpIcon : direction === 'down' ? ArrowDownIcon : null;
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-0.5 rounded-[6px] px-1.5 text-[12px] font-semibold whitespace-nowrap',
        TONES[tone],
      )}
    >
      {Arrow && <Arrow size={12} />}
      <span className="sr-only">
        {t(
          direction === 'up'
            ? 'reports.delta.up'
            : direction === 'down'
              ? 'reports.delta.down'
              : 'reports.delta.same',
        )}{' '}
      </span>
      {value}
    </span>
  );
}
