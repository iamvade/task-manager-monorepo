import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Left side of the 56px row: breadcrumb (+ favorite). */
  title: ReactNode;
  /** Right side of the 56px row. */
  actions?: ReactNode;
  /** Second row, left: view tabs. */
  tabs?: ReactNode;
  /** Second row, right: toolbar. */
  toolbar?: ReactNode;
}

/** Top bar (Main.dc.html): row 1 min 56px, padding 8/24; row 2 tabs + toolbar; bottom border. */
export function PageHeader({ title, actions, tabs, toolbar }: PageHeaderProps) {
  return (
    <header className="flex flex-col border-b border-default">
      <div className="box-border flex min-h-14 flex-wrap items-center justify-between gap-2 px-6 py-2">
        <div className="flex min-w-0 items-center gap-2">{title}</div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      {(tabs ?? toolbar) && (
        <div className="flex flex-wrap items-end justify-between gap-2 px-6">
          {tabs}
          {toolbar}
        </div>
      )}
    </header>
  );
}
