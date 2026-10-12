import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

interface ChartFrameProps {
  /** Y tick values, 0 first; the last one is the top of the plot. */
  ticks: readonly number[];
  /** Labels under the plot, one per equal-width column ('' = no label). */
  xLabels: readonly ReactNode[];
  /** Accessible summary sentence of the whole figure. */
  ariaLabel: string;
  height?: number;
  /** Y label gutter: 32 (Overview) or 28 (Sprints). */
  gutter?: 32 | 28;
  /** Right margin for end-of-line labels (Throughput: 72). */
  endMargin?: number;
  /** Lines, dots, hover columns and tooltip, positioned inside the plot area. */
  children: ReactNode;
  className?: string;
}

/**
 * Plot scaffolding of the Reports charts (design-notes 1.10): 11px muted tick labels in a left
 * gutter, 1px gridlines (`--chart-grid`, baseline `--chart-axis`), the plot (relative, so lines
 * and dots can be positioned by %), and centered x labels under equal-width columns.
 */
export function ChartFrame({
  ticks,
  xLabels,
  ariaLabel,
  height = 200,
  gutter = 32,
  endMargin = 0,
  children,
  className,
}: ChartFrameProps) {
  const top = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => height - (v / (top || 1)) * height;
  return (
    <figure aria-label={ariaLabel} className={cn('m-0 flex flex-col gap-2', className)}>
      <div className="flex">
        <div aria-hidden="true" className="relative flex-none" style={{ width: gutter, height }}>
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-2 text-[11px] leading-3 text-muted tabular-nums"
              style={{ top: y(v) - 6 }}
            >
              {v}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height, marginRight: endMargin }}>
          {ticks.map((v) => (
            <span
              key={v}
              aria-hidden="true"
              className="absolute inset-x-0 h-px"
              style={{ top: y(v), background: v === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)' }}
            />
          ))}
          {children}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex"
        style={{ marginLeft: gutter, marginRight: endMargin }}
      >
        {xLabels.map((label, i) => (
          <span
            // Labels repeat ('' for unlabeled columns), so the index is the identity.
            key={i}
            className="flex-1 text-center text-[11px] whitespace-nowrap text-muted"
          >
            {label}
          </span>
        ))}
      </div>
    </figure>
  );
}
