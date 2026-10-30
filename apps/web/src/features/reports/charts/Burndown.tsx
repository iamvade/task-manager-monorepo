import { useState } from 'react';
import { ChartFrame, type ChartTable } from './ChartFrame';
import { ChartTooltip, HoverColumns, HoverLine, TooltipRow } from './ChartTooltip';
import { columnCenter, linePath, niceTicks } from './scale';

export interface BurndownPoint {
  /** X axis label; '' for unlabeled days. */
  label: string;
  /** Tooltip heading ("Sprint start · Oct 6", "Thu, Oct 8 · today"). */
  title: string;
  /** Open tasks at the end of the day; null after today. */
  remaining: number | null;
  ideal: number;
  /** Projection from today on (null before today). */
  projected: number | null;
  /** Tasks added to the sprint that day ("+2" chip). */
  added: number;
}

interface BurndownProps {
  points: readonly BurndownPoint[];
  /** Index of today, or null for a finished sprint. */
  todayIndex: number | null;
  ariaLabel: string;
  /** The values as a visually hidden table. */
  table?: ChartTable;
  labels: { remaining: string; ideal: string; projection: string; today: string };
  /** "≈ 12 left" at the end of the projection. */
  projectedEndLabel?: string;
  formatCount: (n: number) => string;
  height?: number;
}

const MAIN = 'var(--accent-ink)';

/**
 * Sprint burndown (ReportsSprints.dc.html): remaining (solid accent, dots), ideal (dashed grey
 * 6 5), projection (dotted accent 2 5), a dashed "Today" line, "+N" scope-added chips above the
 * day's point; 28px gutter, hover tooltip like the other charts.
 */
export function Burndown({
  points,
  todayIndex,
  ariaLabel,
  table,
  labels,
  projectedEndLabel,
  formatCount,
  height = 200,
}: BurndownProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const ticks = niceTicks(
    Math.max(0, ...points.flatMap((p) => [p.remaining ?? 0, p.ideal, p.projected ?? 0])),
  );
  const top = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => height - (v / top) * height;
  const path = (values: readonly (number | null)[]) =>
    linePath(values.flatMap((v, i) => (v === null ? [] : [{ x: columnCenter(i, n), y: y(v) }])));
  const x = (i: number) => `${(columnCenter(i, n) * 100).toFixed(2)}%`;

  const lastProjected = [...points].reverse().find((p) => p.projected !== null)?.projected;
  const hovered = hover === null ? undefined : points[hover];

  return (
    <ChartFrame
      ticks={ticks}
      xLabels={points.map((p) => p.label)}
      ariaLabel={ariaLabel}
      table={table}
      height={height}
      gutter={28}
    >
      {todayIndex !== null && (
        <>
          <span
            aria-hidden="true"
            className="absolute -top-1 bottom-0 w-0 border-l border-dashed"
            style={{ left: x(todayIndex), borderColor: 'var(--capacity-line)' }}
          />
          <span
            aria-hidden="true"
            className="absolute -top-5 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap text-3"
            style={{ left: x(todayIndex) }}
          >
            {labels.today}
          </span>
        </>
      )}
      <svg
        aria-hidden="true"
        width="100%"
        height={height}
        viewBox={`0 0 1000 ${String(height)}`}
        preserveAspectRatio="none"
        className="absolute inset-0 overflow-visible"
      >
        <path
          d={path(points.map((p) => p.ideal))}
          fill="none"
          stroke="var(--chart-ideal)"
          strokeWidth={2}
          strokeDasharray="6 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(points.map((p) => p.projected))}
          fill="none"
          stroke={MAIN}
          strokeWidth={2}
          strokeDasharray="2 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(points.map((p) => p.remaining))}
          fill="none"
          stroke={MAIN}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {points.map((p, i) =>
        p.remaining === null ? null : (
          <span
            key={i}
            aria-hidden="true"
            className="absolute -mt-1 -ml-1 size-2 rounded-full shadow-[0_0_0_2px_var(--chart-point-ring)]"
            style={{ left: x(i), top: y(p.remaining), background: MAIN }}
          />
        ),
      )}
      {points.map((p, i) =>
        p.added > 0 && p.remaining !== null ? (
          <span
            key={`added-${String(i)}`}
            aria-hidden="true"
            className="absolute flex h-4 -translate-x-1/2 -translate-y-[26px] items-center rounded-[4px] bg-warning-soft px-1 text-[10px] font-semibold text-warning-soft"
            style={{ left: x(i), top: y(p.remaining) }}
          >
            +{p.added}
          </span>
        ) : null,
      )}
      {projectedEndLabel && lastProjected !== null && lastProjected !== undefined && (
        <span
          aria-hidden="true"
          className="absolute right-0 -translate-y-[130%] text-[11px] font-semibold whitespace-nowrap text-accent-ink"
          style={{ top: y(lastProjected) }}
        >
          {projectedEndLabel}
        </span>
      )}
      {hover !== null && <HoverLine index={hover} count={n} />}
      <HoverColumns
        count={n}
        active={hover}
        name={table?.caption ?? ariaLabel}
        onHover={setHover}
      />
      {hover !== null && hovered && (
        <ChartTooltip index={hover} count={n}>
          <span className="font-semibold text-default">{hovered.title}</span>
          {hovered.remaining !== null && (
            <TooltipRow label={labels.remaining} value={formatCount(hovered.remaining)} strong />
          )}
          {hovered.remaining === null && hovered.projected !== null && (
            <TooltipRow
              label={labels.projection}
              value={formatCount(Math.round(hovered.projected))}
              strong
            />
          )}
          <TooltipRow label={labels.ideal} value={formatCount(Math.round(hovered.ideal))} />
        </ChartTooltip>
      )}
    </ChartFrame>
  );
}
