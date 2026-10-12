import type { ReactNode } from 'react';
import { InfoIcon, WarningIcon } from '../../../components/icons';
import { cn } from '../../../lib/cn';

/**
 * Tinted note under a chart (Reports.dc.html "Where work waits"): radius 8, padding 10 12,
 * 13/20 `--text-2` with a 14px info icon on accent-soft, or a warning icon on warning-soft
 * (burndown).
 */
export function InsightBox({
  tone = 'accent',
  children,
  className,
}: {
  tone?: 'accent' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'm-0 flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-[13px] leading-5 text-2',
        tone === 'accent' ? 'bg-accent-soft' : 'bg-warning-soft',
        className,
      )}
    >
      {tone === 'accent' ? (
        <InfoIcon size={14} className="mt-[3px] flex-none text-accent-ink" />
      ) : (
        <WarningIcon size={14} className="mt-[3px] flex-none text-warning-icon" />
      )}
      <span>{children}</span>
    </p>
  );
}
