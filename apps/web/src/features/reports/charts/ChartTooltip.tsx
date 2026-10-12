import type { ReactNode } from 'react';
import { tooltipPlacement } from './scale';

interface ChartTooltipProps {
  /** Hovered column and the column count: the tooltip flips near the edges. */
  index: number;
  count: number;
  children: ReactNode;
}

/**
 * Chart hover card (Reports.dc.html): surface, 1px border, radius 8, padding 8 10, 12px text,
 * `--shadow-tooltip`, min-width 168, 8px from the top of the plot; flips near the edges.
 */
export function ChartTooltip({ index, count, children }: ChartTooltipProps) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-[2] flex min-w-[168px] flex-col gap-1 rounded-[8px] border border-tooltip bg-surface px-2.5 py-2 text-[12px] shadow-tooltip"
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

/** Invisible equal-width columns that report the hovered index. */
export function HoverColumns({
  count,
  onHover,
}: {
  count: number;
  onHover: (index: number | null) => void;
}) {
  return (
    <div
      className="absolute inset-0 flex"
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
