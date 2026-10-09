import type { ReactNode } from 'react';

interface EmptyStateProps {
  illustration?: ReactNode;
  title?: string;
  body?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Heading level for the title (h1 on a page of its own, h2 inside one). */
  as?: 'h1' | 'h2';
}

/** Centered empty/placeholder state: illustration, 20/28 heading, 14px muted body, actions. */
export function EmptyState({
  illustration,
  title,
  body,
  actions,
  footer,
  as: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-[440px] flex-col items-center gap-2 text-center">
        {illustration && <div className="mb-4">{illustration}</div>}
        {title && (
          <Heading className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {title}
          </Heading>
        )}
        {body && <p className="m-0 text-[14px] leading-[22px] text-muted">{body}</p>}
        {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
        {footer && <div className="mt-6 text-[13px] text-muted">{footer}</div>}
      </div>
    </div>
  );
}
