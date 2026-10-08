import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered inside the field on the right, e.g. a show-password button. */
  trailing?: ReactNode;
}

/** Labelled input: 38px field, 1px control border, radius 8, accent focus ring around the field. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className = '', ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <div
        className={`flex h-[38px] items-center gap-2 rounded-[8px] border bg-control pr-1 pl-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent-ink ${
          error ? 'border-danger' : 'border-border-control'
        }`}
      >
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] outline-none placeholder:text-text-faint focus-visible:outline-none"
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[12px] leading-4 text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] leading-4 text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
