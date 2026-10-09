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
  /**
   * sm: 24px segments r5 on a r7 track (12/600); md: 28px r6 on r8 (13/500); tabs: 26px r6 on
   * r8 (12/500, TaskDetail activity filter).
   */
  size?: 'sm' | 'md' | 'tabs';
  /** `tablist` for filters that switch a panel (TaskDetail activity tabs). */
  role?: 'radiogroup' | 'tablist';
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
  role = 'radiogroup',
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
      role={role}
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
            role={role === 'tablist' ? 'tab' : 'radio'}
            aria-checked={role === 'tablist' ? undefined : selected}
            aria-selected={role === 'tablist' ? selected : undefined}
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
              size === 'sm' && 'h-6 rounded-[5px] px-2 text-[12px] font-semibold',
              size === 'md' && 'h-7 rounded-[6px] px-3 text-[13px] font-medium',
              size === 'tabs' && 'h-[26px] flex-none rounded-[6px] px-2.5 text-[12px] font-medium',
              selected
                ? 'bg-segment-active text-default shadow-segment'
                : cn('bg-transparent', size === 'tabs' ? 'text-3' : 'text-muted'),
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
