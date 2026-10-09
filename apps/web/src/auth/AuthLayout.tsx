import type { ReactNode } from 'react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Shell for the signed-out pages (login, invite accept). Not in the designs; built from the
 * modal style: 400px surface card, radius 14, `--shadow-modal`, on the subtle page background.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-subtle">
      <header className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-[6px] bg-accent text-[13px] font-semibold text-white"
          >
            K
          </span>
          <span className="text-[14px] font-semibold">Kite</span>
        </div>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[min(12vh,112px)] pb-16">
        <div className="w-full max-w-[400px] rounded-[14px] border border-default bg-surface p-8 shadow-[var(--shadow-modal)]">
          <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.01em]">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
