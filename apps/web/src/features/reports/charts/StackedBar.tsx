export interface StackedSegment {
  key: string;
  value: number;
  /**
   * CSS color, `hatch` for the striped "No due date" segment, or `outline` for an empty dashed
   * box (Workload: points outside the load window).
   */
  fill: string;
  /** Hover title ("Overdue: 8 pts (2 tasks)"). */
  title: string;
}

interface StackedBarProps {
  segments: readonly StackedSegment[];
  /** Value of the full width, shared by every row so bars compare. */
  scale: number;
  /** Dashed marker (capacity) at this value. */
  marker?: number;
  markerTitle?: string;
}

const HATCH =
  'repeating-linear-gradient(135deg, var(--bucket-none-a) 0 3px, var(--bucket-none-b) 3px 4px)';

/** Radius of segment j of k: outer corners 4px, inner 1px (ReportsWorkload.dc.html). */
function radius(j: number, k: number): string {
  if (k === 1) return '4px';
  if (j === 0) return '4px 1px 1px 4px';
  if (j === k - 1) return '1px 4px 4px 1px';
  return '1px';
}

/**
 * One row of a stacked bar chart (Workload): 14px segments 2px apart, widths ∝ value, on a
 * shared `scale`; a 1px dashed marker line (capacity) spans the 28px row.
 */
export function StackedBar({ segments, scale, marker, markerTitle }: StackedBarProps) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  const pct = (v: number) => `${((Math.min(v, scale) / (scale || 1)) * 100).toFixed(1)}%`;
  return (
    <span className="relative flex h-7 items-center">
      {marker !== undefined && (
        <span
          aria-hidden="true"
          title={markerTitle}
          data-marker
          className="absolute top-0.5 bottom-0.5 w-0 border-l border-dashed"
          style={{ left: pct(marker), borderColor: 'var(--capacity-line)' }}
        />
      )}
      <span aria-hidden="true" className="flex h-3.5 gap-0.5" style={{ width: pct(total) }}>
        {shown.map((s, j) => (
          <span
            key={s.key}
            title={s.title}
            className="box-border h-3.5"
            style={{
              flex: `${String(s.value)} 0 0`,
              borderRadius: radius(j, shown.length),
              ...(s.fill === 'hatch'
                ? { background: HATCH, border: '1px solid var(--bucket-none-border)' }
                : s.fill === 'outline'
                  ? { border: '1px dashed var(--bucket-none-border)' }
                  : { background: s.fill }),
            }}
          />
        ))}
      </span>
    </span>
  );
}
