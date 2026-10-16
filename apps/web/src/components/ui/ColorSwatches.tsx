import type { PaletteKey } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { paletteClass, type PaletteFamily } from '../../lib/palette';
import { CheckIcon } from '../icons';

interface ColorSwatchesProps<K extends PaletteKey> {
  /** The choices, in order. */
  colors: readonly K[];
  /** Which palette table paints them (avatar colors differ from tag colors). */
  family: PaletteFamily;
  /** A color outside `colors` selects none (the first one stays tabbable). */
  value: PaletteKey;
  onChange: (color: K) => void;
  labelledBy?: string;
  label?: string;
  /** Text on each unselected swatch (the avatar's initials); empty for plain swatches. */
  text?: string;
}

/**
 * Palette colors as a radio group of round chips; the selected one shows ✓. Arrow keys move the
 * choice (only the selected chip is tabbable). Names come from `settings.colors.*`.
 */
export function ColorSwatches<K extends PaletteKey>({
  colors,
  family,
  value,
  onChange,
  labelledBy,
  label,
  text = '',
}: ColorSwatchesProps<K>) {
  const { t } = useTranslation();
  const selectedIndex = colors.findIndex((c) => c === value);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className="flex flex-wrap gap-1.5"
    >
      {colors.map((color, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`settings.colors.${color}`)}
            title={t(`settings.colors.${color}`)}
            tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => {
              onChange(color);
            }}
            onKeyDown={(e) => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              const next = (i + step + colors.length) % colors.length;
              const nextColor = colors[next];
              if (nextColor) onChange(nextColor);
              e.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
            }}
            className={cn(
              'pal-fill relative flex size-7 items-center justify-center rounded-full border-0 p-0 text-[10px] font-semibold',
              paletteClass(family, color),
              selected && 'outline-2 outline-offset-2 outline-accent-ink',
            )}
          >
            {selected ? <CheckIcon size={14} strokeWidth={2.5} /> : text}
          </button>
        );
      })}
    </div>
  );
}
