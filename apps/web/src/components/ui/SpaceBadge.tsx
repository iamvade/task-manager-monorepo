import type { PaletteKey } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

const RADIUS = { 16: 4, 18: 5, 22: 6 } as const;

interface SpaceBadgeProps {
  initial: string;
  color: PaletteKey;
  size?: 16 | 18 | 22;
  className?: string;
}

/** Square space badge with its initial: 16 (r4), 18 (r5) or 22px (r6, rail). */
export function SpaceBadge({ initial, color, size = 18, className }: SpaceBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pal-fill flex flex-none items-center justify-center font-semibold',
        paletteClass('space', color),
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS[size],
        fontSize: size === 16 ? 10 : 11,
      }}
    >
      {initial}
    </span>
  );
}
