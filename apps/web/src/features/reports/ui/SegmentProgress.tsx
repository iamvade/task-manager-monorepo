/** Segmented progress (ReportsEmpty.dc.html): `max` 6px segments 4px apart, done in accent. */
export function SegmentProgress({
  value,
  max,
  labelledBy,
}: {
  value: number;
  max: number;
  labelledBy: string;
}) {
  return (
    <div
      role="progressbar"
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="flex gap-1"
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-[3px] ${i < value ? 'bg-accent' : 'bg-progress-track'}`}
        />
      ))}
    </div>
  );
}
