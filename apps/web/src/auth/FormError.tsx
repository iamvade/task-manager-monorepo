import type { ReactNode } from 'react';

/** Form-level error banner (danger soft: #FDECEC / #B42318). */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[8px] bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger-soft-fg"
    >
      {children}
    </p>
  );
}
