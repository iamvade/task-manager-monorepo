import type { StatusCategory } from '@kite/shared';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { StatusDot } from './StatusDot';

const TINT: Record<StatusCategory, string> = {
  todo: 'bg-tint-todo text-tint-todo',
  in_progress: 'bg-tint-progress text-tint-progress',
  review: 'bg-tint-review text-tint-review',
  done: 'bg-tint-done text-tint-done',
};

/**
 * Status name in its category tint with an 8px marker (TaskDetail.dc.html history lines). The
 * name comes from `name` or `children` (react-i18next `<Trans>` fills children).
 */
export function StatusPill({
  name,
  category,
  children,
}: {
  name?: string;
  category: StatusCategory;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-[5px] rounded-[6px] px-[7px] align-middle text-[12px] font-medium',
        TINT[category],
      )}
    >
      <StatusDot category={category} size={8} />
      {children ?? name}
    </span>
  );
}
