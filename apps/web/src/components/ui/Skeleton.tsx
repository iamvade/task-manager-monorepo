import { cn } from '../../lib/cn';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  className?: string;
  /** Reports shimmer (ReportsLoading.dc.html) instead of the pulse. */
  shimmer?: boolean;
}

/** Pulsing placeholder block. Parents mark the region `aria-busy`. */
export function Skeleton({ width = '100%', height = 12, className, shimmer }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block',
        // Default radius unless the caller sets one (cn doesn't merge conflicting classes).
        !className?.includes('rounded') && 'rounded-[6px]',
        shimmer ? 'skeleton-shimmer' : 'animate-pulse bg-surface-2',
        className,
      )}
      style={{ width, height }}
    />
  );
}
