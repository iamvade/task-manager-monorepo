import type { PaletteKey } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

interface TagChipProps {
  name: string;
  color: PaletteKey;
}

/**
 * Tag: an 8px dot in the tag's palette ink before the name, 12px/500, no background
 * (user decision 2026-11-27; the designs draw a soft-filled chip). 22px tall like the old chip.
 */
export function TagChip({ name, color }: TagChipProps) {
  return (
    <span
      className={cn(
        'flex h-[22px] flex-none items-center gap-1.5 text-[12px] font-medium whitespace-nowrap text-2',
        paletteClass('tag', color),
      )}
    >
      <span aria-hidden="true" className="size-2 flex-none rounded-full bg-[var(--p-fg)]" />
      {name}
    </span>
  );
}
