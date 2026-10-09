import type { PaletteKey } from '@kite/shared';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';

interface ProjectDotProps {
  /** Palette key, `accent` (active sidebar project) or `inactive` (sidebar #C4C4CC). */
  color: PaletteKey | 'accent' | 'inactive';
  size?: 6 | 8;
}

export function ProjectDot({ color, size = 6 }: ProjectDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex-none rounded-full',
        color === 'accent'
          ? 'bg-accent'
          : color === 'inactive'
            ? 'bg-project-dot-inactive'
            : cn('pal-dot', paletteClass('project', color)),
      )}
      style={{ width: size, height: size }}
    />
  );
}
