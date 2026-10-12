import type { WorkloadBucket } from '@kite/shared';
import type { CSSProperties } from 'react';

/** Bar segment colors (ReportsWorkload.dc.html); "No due date" is hatched. */
export const BUCKET_FILL: Record<WorkloadBucket, string> = {
  overdue: 'var(--bucket-overdue)',
  week: 'var(--bucket-week)',
  later: 'var(--bucket-later)',
  none: 'hatch',
};

/** Legend / due swatch style for a bucket. */
export function bucketSwatch(bucket: WorkloadBucket): CSSProperties {
  return bucket === 'none'
    ? {
        background:
          'repeating-linear-gradient(135deg, var(--bucket-none-a) 0 3px, var(--bucket-none-b) 3px 4px)',
        border: '1px solid var(--bucket-none-border)',
      }
    : { background: BUCKET_FILL[bucket] };
}

/** Due label tone per bucket: overdue danger 500, this week warm 500, later text-2, none muted. */
export const BUCKET_TEXT: Record<WorkloadBucket, string> = {
  overdue: 'font-medium text-due-overdue',
  week: 'font-medium text-warning-soft',
  later: 'text-2',
  none: 'text-muted',
};
