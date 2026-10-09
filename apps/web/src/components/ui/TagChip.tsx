import type { PaletteKey } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

interface TagChipProps {
  name: string;
  color: PaletteKey;
}

/** 22px tag chip, radius 6, 12px/500, soft palette bg + dark fg (tinted bg + light fg in dark). */
export function TagChip({ name, color }: TagChipProps) {
  return (
    <span
      className={cn(
        'pal-fill flex h-[22px] flex-none items-center rounded-[6px] px-2 text-[12px] font-medium whitespace-nowrap',
        paletteClass('tag', color),
      )}
    >
      {name}
    </span>
  );
}
