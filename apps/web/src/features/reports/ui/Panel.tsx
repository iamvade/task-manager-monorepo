import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

/** Reports panel: 1px border, radius 12, `--panel` background (darker than surface in dark). */
export function Panel({
  labelledBy,
  className,
  children,
}: {
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        'flex min-w-0 flex-col rounded-[12px] border border-default bg-panel',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** 15/600 heading + 13px muted subtitle, 2px apart (People / My performance: 14/600 + 12px). */
export function PanelHeading({
  id,
  title,
  sub,
  size = 15,
}: {
  id: string;
  title: string;
  sub?: ReactNode;
  size?: 15 | 14;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2
        id={id}
        className={cn('m-0 leading-5 font-semibold', size === 15 ? 'text-[15px]' : 'text-[14px]')}
      >
        {title}
      </h2>
      {sub && (
        <span className={cn('text-muted', size === 15 ? 'text-[13px]' : 'text-[12px]')}>{sub}</span>
      )}
    </div>
  );
}
