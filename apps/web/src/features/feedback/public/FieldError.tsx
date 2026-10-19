import type { ReactNode } from 'react';
import { AlertCircleIcon } from './publicIcons';

/** Inline field error: 13px danger ink with the alert-circle icon. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      className="m-0 mt-2 flex items-start gap-1.5 text-[13px] leading-[18px] text-danger-soft"
    >
      <AlertCircleIcon size={14} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </p>
  );
}
