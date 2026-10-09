import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  lang?: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group (or use `labelledBy`). */
  label?: string;
  labelledBy?: string;
  /** `sidebar` = #EDEDF0 track (Main language switcher); `default` = --surface-2. */
  track?: 'sidebar' | 'default';
  /** sm: 24px segments r5 on a r7 track (12/600); md: 28px r6 on r8 (13/500). */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Radio-group segmented control: 2px-padded track, selected = raised `--segment-active` with
 * `--shadow-segment`. Arrow keys move and select (roving tabindex).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  track = 'default',
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cn(
        'flex gap-0.5 p-0.5',
        size === 'sm' ? 'rounded-[7px]' : 'rounded-[8px]',
        track === 'sidebar' ? 'bg-segment-track-sidebar' : 'bg-segment-track',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            lang={option.lang}
            title={option.title}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(e) => {
              onKeyDown(e, index);
            }}
            className={cn(
              'flex-1 border-0 whitespace-nowrap',
              size === 'sm'
                ? 'h-6 rounded-[5px] px-2 text-[12px] font-semibold'
                : 'h-7 rounded-[6px] px-3 text-[13px] font-medium',
              selected
                ? 'bg-segment-active text-default shadow-segment'
                : 'bg-transparent text-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
