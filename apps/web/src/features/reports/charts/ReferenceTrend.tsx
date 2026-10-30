import { useState } from 'react';
import { ChartDataTable, type ChartTable } from './ChartFrame';
import { ChartTooltip, HoverColumns } from './ChartTooltip';
import { columnCenter, linePath } from './scale';

export interface ReferencePoint {
  /** X axis label ("Jul 20"); only the first and last are drawn. */
  label: string;
  /** Tooltip heading ("Week of Oct 5"). */
  title: string;
  /** null = nothing to plot that week (a gap in the line). */
  value: number | null;
  /** Still in progress: `partialNote` in the tooltip. */
  partial?: boolean;
}

interface ReferenceTrendProps {
  points: readonly ReferencePoint[];
  /** Dashed horizontal reference (Team median); null = not drawn. */
  reference: number | null;
  /** Top of the plot. */
  max: number;
  /** End label and tooltip value ("3", "2.4"). */
  formatValue: (value: number) => string;
  /** Tooltip value with its unit ("3 tasks"). */
  formatTooltip: (value: number) => string;
  partialNote?: string;
  ariaLabel: string;
  table?: ChartTable;
}

const HEIGHT = 96;
const LINE = 'var(--accent-ink)';

/**
 * Compact weekly line against a reference (ReportsPeople.dc.html trends): a 96px plot with a 40px
 * right margin for the last value, 1px `--border` baseline, the reference as a 1px dashed
 * `--text-faint` line, a 2px accent line (gaps where a week has no value), one 8px point on the
 * last (or hovered) week; x labels for the first and last week only.
 */
export function ReferenceTrend({
  points,
  reference,
  max,
  formatValue,
  formatTooltip,
  partialNote,
  ariaLabel,
  table,
}: ReferenceTrendProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const top = max > 0 ? max : 1;
  const y = (v: number) => HEIGHT - (Math.min(v, top) / top) * HEIGHT;

  // One subpath per run of weeks with a value.
  const segments: { x: number; y: number }[][] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      segments.push([]);
      return;
    }
    const run = segments[segments.length - 1];
    const point = { x: columnCenter(i, n), y: y(p.value) };
    if (run) run.push(point);
    else segments.push([point]);
  });
  const path = segments
    .filter((s) => s.length > 1)
    .map((s) => linePath(s))
    .join(' ');
  // A week with no neighbours draws no line: show it as a small point instead.
  const isolated = segments.flatMap((s) => (s.length === 1 ? s : []));

  let lastIndex = -1;
  points.forEach((p, i) => {
    if (p.value !== null) lastIndex = i;
  });
  const last = lastIndex >= 0 ? points[lastIndex] : undefined;
  const hovered = hover === null ? undefined : points[hover];
  const dotIndex = hovered?.value != null && hover !== null ? hover : lastIndex;
  const dot = dotIndex >= 0 ? points[dotIndex] : undefined;

  return (
    <figure aria-label={ariaLabel} className="m-0 flex flex-col gap-1.5">
      <div className="relative mr-10" style={{ height: HEIGHT }}>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: 'var(--border)' }}
        />
        {reference !== null && (
          <span
            aria-hidden="true"
            data-reference
            className="absolute inset-x-0 h-0 border-t border-dashed"
            style={{ top: y(reference), borderColor: 'var(--text-faint)' }}
          />
        )}
        <svg
          aria-hidden="true"
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 1000 ${String(HEIGHT)}`}
          preserveAspectRatio="none"
          className="absolute inset-0 overflow-visible"
        >
          <path
            d={path}
            fill="none"
            stroke={LINE}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {isolated.map((p) => (
          <span
            key={p.x}
            aria-hidden="true"
            className="absolute -mt-[3px] -ml-[3px] size-1.5 rounded-full"
            style={{ left: `${(p.x * 100).toFixed(2)}%`, top: p.y, background: LINE }}
          />
        ))}
        {dot?.value != null && (
          <span
            aria-hidden="true"
            className="absolute -mt-1 -ml-1 size-2 rounded-full shadow-[0_0_0_2px_var(--chart-point-ring)]"
            style={{
              left: `${(columnCenter(dotIndex, n) * 100).toFixed(2)}%`,
              top: y(dot.value),
              background: LINE,
            }}
          />
        )}
        {last?.value != null && (
          <span
            aria-hidden="true"
            className="absolute left-[calc(100%+8px)] -translate-y-1/2 text-[12px] leading-4 font-semibold whitespace-nowrap text-default tabular-nums"
            style={{ top: y(last.value) }}
          >
            {formatValue(last.value)}
          </span>
        )}
        <HoverColumns
          count={n}
          active={hover}
          name={table?.caption ?? ariaLabel}
          onHover={setHover}
        />
        {hover !== null && hovered && (
          <ChartTooltip index={hover} count={n} compact>
            <span className="text-muted">{hovered.title}</span>
            <strong className="font-semibold text-default">
              {hovered.value === null ? '—' : formatTooltip(hovered.value)}
            </strong>
            {hovered.partial && partialNote && <span className="text-muted">{partialNote}</span>}
          </ChartTooltip>
        )}
      </div>
      <div
        aria-hidden="true"
        className="mr-10 flex justify-between gap-2 text-[11px] whitespace-nowrap text-muted"
      >
        <span>{points[0]?.label}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
      {table && <ChartDataTable table={table} />}
    </figure>
  );
}
