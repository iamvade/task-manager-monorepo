import type { InboxTab } from '@kite/shared';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BellIcon, CheckIcon, InboxIcon } from '../../components/icons';
import { buttonVariants } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';

const ctaBase =
  'inline-flex h-10 items-center justify-center gap-2 rounded-[8px] text-[14px] font-medium whitespace-nowrap no-underline';

/** "You're all caught up" (EmptyInbox.dc.html), with the real archived count. */
export function InboxEmpty({ tab, archivedCount }: { tab: InboxTab; archivedCount: number }) {
  const { t } = useTranslation();
  if (tab !== 'all') return <EmptyState title={t(`inbox.emptyTab.${tab}`)} />;

  return (
    <div className="flex flex-1 items-center justify-center px-6 pt-16 pb-24">
      <div className="flex max-w-[440px] flex-col items-center gap-6 text-center">
        <div className="relative size-28 flex-none">
          <div className="flex size-28 items-center justify-center rounded-full border border-subtle bg-sidebar text-faint">
            <InboxIcon size={52} strokeWidth={1.5} />
          </div>
          <span className="absolute top-1.5 right-1 flex size-8 items-center justify-center rounded-full bg-[var(--success)] text-white shadow-[0_0_0_4px_var(--bg)]">
            <CheckIcon size={16} strokeWidth={3} />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {t('inbox.empty.title')}
          </h2>
          <p className="m-0 text-[14px] leading-[22px] text-3">{t('inbox.empty.body')}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/my-tasks" className={`${ctaBase} ${buttonVariants.primary} px-4`}>
            {t('inbox.empty.goToMyTasks')}
          </Link>
          <Link
            to="/settings?tab=notifications"
            className={`${ctaBase} border border-control bg-control px-3.5 text-2 hover:bg-hover`}
          >
            <BellIcon size={14} />
            {t('inbox.notificationSettings')}
          </Link>
        </div>
        {archivedCount > 0 && (
          <Link
            to="?tab=archived"
            className="text-[13px] font-medium text-accent-ink no-underline hover:underline"
          >
            {t('inbox.empty.viewArchived', { count: archivedCount })}
          </Link>
        )}
        <p className="m-0 mt-4 text-[12px] leading-6 text-muted">
          <Trans
            i18nKey="inbox.empty.tip"
            components={{
              kbd: (
                <kbd className="mx-0.5 inline-block rounded-[4px] border border-b-2 border-control bg-control px-1.5 font-sans text-[11px] leading-[18px] text-2" />
              ),
            }}
          />
        </p>
      </div>
    </div>
  );
}
