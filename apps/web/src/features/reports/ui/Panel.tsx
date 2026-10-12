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

/** 15/600 heading + 13px muted subtitle, 2px apart. */
export function PanelHeading({ id, title, sub }: { id: string; title: string; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2 id={id} className="m-0 text-[15px] leading-5 font-semibold">
        {title}
      </h2>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </div>
  );
}
