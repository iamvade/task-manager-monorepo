import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** Right of the number, 13px (Reports: "days", "· 386 points", "124 of 142"). */
  unit?: ReactNode;
  /** Right of the number, 12px muted (My Tasks: "of 5 left · 1 urgent"). */
  sub?: ReactNode;
  /** Far right of the number row (My Tasks week bars). */
  aside?: ReactNode;
  /** Line under the number (Reports: delta chip + "vs previous period"). */
  footer?: ReactNode;
  /** danger = overdue card (tinted border/bg, red number). */
  tone?: 'default' | 'danger';
  /** 28/32 (Overview, My Tasks) or 26/32 (Sprints, People, My performance). */
  valueSize?: 28 | 26;
  className?: string;
}

/**
 * 12px-radius stat card (MyTasks.dc.html, Reports.dc.html): icon + 13px label, a 28/32 number
 * with a unit or note, optionally a footer line.
 */
export function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  aside,
  footer,
  tone = 'default',
  valueSize = 28,
  className,
}: StatCardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-[12px] border p-4',
        tone === 'danger' ? 'border-danger-card bg-danger-card' : 'border-default',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-3">
        {icon}
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              'leading-8 font-semibold tabular-nums',
              valueSize === 28 ? 'text-[28px]' : 'text-[26px]',
              tone === 'danger' ? 'text-danger' : 'text-default',
            )}
          >
            {value}
          </span>
          {unit !== undefined && <span className="min-w-0 text-[13px] text-3">{unit}</span>}
          {sub !== undefined && <span className="min-w-0 text-[12px] text-muted">{sub}</span>}
        </div>
        {aside}
      </div>
      {footer}
    </div>
  );
}
