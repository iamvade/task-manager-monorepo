import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. «…» ажлыг дууссан гэж тэмдэглэх. */
  label: string;
}

/** Native square 16px checkbox tinted with the accent (as in the designs). */
export function Checkbox({ checked, onChange, label, className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        onChange(e.target.checked);
      }}
      aria-label={label}
      className={cn('m-0 size-4 cursor-pointer accent-[var(--accent)]', className)}
      {...props}
    />
  );
}
