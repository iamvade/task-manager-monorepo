import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { tooltipPlacement } from './scale';

interface ChartTooltipProps {
  /** Hovered column and the column count: the tooltip flips near the edges. */
  index: number;
  count: number;
  /** People / My performance trends: one row, padding 6 8, no min width, 6px above the plot. */
  compact?: boolean;
  children: ReactNode;
}

/**
 * Chart hover card (Reports.dc.html): surface, 1px border, radius 8, padding 8 10, 12px text,
 * `--shadow-tooltip`, min-width 168, 8px from the top of the plot; flips near the edges. Hidden
 * from screen readers: the figure's data table carries the same values without announcing each
 * hover.
 */
export function ChartTooltip({ index, count, compact, children }: ChartTooltipProps) {
  return (
    <div
      aria-hidden="true"
      data-chart-tooltip=""
      className={cn(
        'pointer-events-none absolute z-[2] flex rounded-[8px] border border-tooltip bg-surface text-[12px] shadow-tooltip',
        compact
          ? 'bottom-[calc(100%+6px)] gap-2 px-2 py-1.5 whitespace-nowrap'
          : 'top-2 min-w-[168px] flex-col gap-1 px-2.5 py-2',
      )}
      style={tooltipPlacement(index, count)}
    >
      {children}
    </div>
  );
}

/** One tooltip row: color dot, series name, value (bold for the main series). */
export function TooltipRow({
  color,
  label,
  value,
  strong,
}: {
  color?: string;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1.5 ${strong ? 'text-2' : 'text-3'}`}>
      {color && <span className="size-2 flex-none rounded-full" style={{ background: color }} />}
      <span className="flex-1">{label}</span>
      {strong ? <strong className="font-semibold">{value}</strong> : <span>{value}</span>}
    </span>
  );
}

/** Vertical 1px line under the hovered column. */
export function HoverLine({ index, count }: { index: number; count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 w-px"
      style={{
        left: `${(((index + 0.5) / count) * 100).toFixed(2)}%`,
        background: 'var(--chart-axis)',
      }}
    />
  );
}

/**
 * Invisible equal-width columns that report the hovered index. The layer is also the chart's
 * keyboard stop: focus shows the latest column, ←/→/Home/End step, Esc closes the tooltip.
 */
export function HoverColumns({
  count,
  active,
  name,
  onHover,
}: {
  count: number;
  /** The hovered column, for keyboard steps from it. */
  active: number | null;
  /** The chart's name, read out with the keyboard hint. */
  name: string;
  onHover: (index: number | null) => void;
}) {
  const { t } = useTranslation();
  const last = count - 1;
  const onKeyDown = (event: KeyboardEvent) => {
    const from = active ?? last;
    let next: number | null;
    if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (event.key === 'ArrowRight') next = Math.min(last, from + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape' && active !== null) next = null;
    else return;
    event.preventDefault();
    onHover(next);
  };
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={t('reports.chartExplore', { chart: name })}
      className="absolute inset-0 flex rounded-[4px]"
      onKeyDown={onKeyDown}
      onFocus={() => {
        // A mouse click focuses the layer too; keep the column under the pointer then.
        if (active === null) onHover(last);
      }}
      onBlur={() => {
        onHover(null);
      }}
      onMouseLeave={() => {
        onHover(null);
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-full flex-1"
          onMouseEnter={() => {
            onHover(i);
          }}
        />
      ))}
    </div>
  );
}
