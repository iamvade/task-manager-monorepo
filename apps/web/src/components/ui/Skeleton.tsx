import { cn } from '../../lib/cn';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  className?: string;
}

/** Pulsing placeholder block. Parents mark the region `aria-busy`. */
export function Skeleton({ width = '100%', height = 12, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-[6px] bg-surface-2', className)}
      style={{ width, height }}
    />
  );
}
