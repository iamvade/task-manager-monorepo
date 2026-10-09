import { cn } from '../../lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label next to the track. */
  label: string;
  className?: string;
}

/**
 * On/off switch (CreateTask.dc.html "Create more"): 28×16 track (#D4D4D8 off, accent on),
 * 12px white knob; a visually hidden checkbox carries the state and focus.
 */
export function Switch({ checked, onChange, label, className }: SwitchProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-[13px] text-2 select-none',
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'box-border flex h-4 w-7 flex-none items-center rounded-[8px] p-0.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent-ink',
          checked ? 'justify-end bg-accent' : 'justify-start bg-[var(--border-strong)]',
        )}
      >
        <span className="size-3 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
      </span>
      {label}
    </label>
  );
}
