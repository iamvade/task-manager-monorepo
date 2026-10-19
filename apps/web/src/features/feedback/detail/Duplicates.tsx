import type { FeedbackDetail, FeedbackReportRef } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useFeedbackBatch } from '../../../api/feedback';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { toast } from '../../../stores/toast';
import { submitterName, submitterUser } from '../format';

/** "N people reported this. All reports are linked to APP-118." (FeedbackDuplicates.dc.html). */
export function DuplicatesBanner({
  reports,
  taskKey,
}: {
  reports: readonly FeedbackReportRef[];
  taskKey: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="flex items-center gap-3 rounded-[10px] border border-[var(--fb-banner-border)] bg-[var(--fb-banner-bg)] px-3 py-2.5"
    >
      <span aria-hidden="true" className="flex">
        {reports.slice(0, 3).map((r) => (
          <span key={r.id} className="-mr-1.5 rounded-full border-2 border-[var(--fb-banner-bg)]">
            <Avatar user={submitterUser(r)} size={24} textSize={9} title={null} />
          </span>
        ))}
      </span>
      <span className="flex-1 pl-1.5 text-[13px] text-[var(--fb-banner-fg)]">
        {t('feedback.duplicates.banner', { count: reports.length, key: taskKey })}
      </span>
      <a
        href="#fb-dups"
        onClick={(e) => {
          e.preventDefault();
          const section = document.getElementById('fb-dups');
          section?.scrollIntoView({ block: 'nearest' });
          section?.querySelector<HTMLElement>('a')?.focus();
        }}
        className="text-[13px] font-semibold text-[var(--fb-banner-link)] hover:underline"
      >
        {t('feedback.duplicates.seeAll')}
      </a>
    </div>
  );
}

/** Every report linked to the task, with "Notify all" (mailto, BCC) and "Close all". */
export function DuplicatesList({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: FeedbackDetail;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { ago } = useRelativeTime();
  const batch = useFeedbackBatch(workspaceId);
  const reports = detail.linkedReports;
  const open = reports.filter((r) => r.status !== 'closed');
  const refs = reports.map((r) => r.ref).join(', ');
  const emails = [...new Set(reports.map((r) => r.email))];
  const mailto = `mailto:?bcc=${emails.map(encodeURIComponent).join(',')}&subject=${encodeURIComponent(
    t('feedback.duplicates.notifySubject', { refs }),
  )}`;
  const href = (ref: string) => {
    const params = new URLSearchParams(location.search);
    params.set('item', ref);
    return { search: `?${params.toString()}` };
  };

  return (
    <section
      id="fb-dups"
      aria-labelledby="fb-dup-h"
      className="flex flex-col gap-2 border-t border-subtle pt-4"
    >
      <h2 id="fb-dup-h" className="m-0 text-[12px] font-medium text-muted">
        {t('feedback.duplicates.title')}
      </h2>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[10px] border border-default bg-surface p-0">
        {reports.map((r) => {
          const current = r.id === detail.id;
          return (
            <li
              key={r.id}
              className={cn(
                'flex items-start gap-2.5 border-b border-subtle px-3 py-2.5 last:border-b-0',
                current && 'bg-[var(--fb-unread-row)]',
              )}
            >
              <Avatar user={submitterUser(r)} size={24} textSize={9} title={null} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link
                  to={href(r.ref)}
                  replace
                  aria-current={current ? 'page' : undefined}
                  className="truncate text-[13px] font-medium text-default hover:underline"
                >
                  {r.title}
                </Link>
                <span className="truncate text-[11px] text-muted">
                  <span className="font-mono">{r.ref}</span> · {submitterName(r)} ·{' '}
                  {ago(r.createdAt)}
                </span>
              </span>
              <span
                className={cn(
                  'flex h-5 flex-none items-center rounded-full px-[7px] text-[11px] font-semibold',
                  current ? 'bg-accent-soft text-accent-ink' : 'bg-chip text-2',
                )}
              >
                {current ? t('feedback.duplicates.thisOne') : t('feedback.duplicates.duplicate')}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1.5">
        <a
          href={mailto}
          className="flex h-8 flex-1 items-center justify-center rounded-[8px] border border-default bg-surface text-[12px] font-medium hover:bg-hover"
        >
          {t('feedback.duplicates.notifyAll')}
        </a>
        <Button
          className="h-8 flex-1 text-[12px]"
          disabled={open.length === 0 || batch.isPending}
          onClick={() => {
            batch.mutate(
              { ids: open.map((r) => r.id), change: { action: 'status', status: 'closed' } },
              {
                onSuccess: ({ changed }) => {
                  toast({ message: t('feedback.duplicates.closedAll', { count: changed }) });
                },
                onError: () => {
                  toast({ message: t('feedback.detail.failed'), tone: 'danger' });
                },
              },
            );
          }}
        >
          {t('feedback.duplicates.closeAll')}
        </Button>
      </div>
      <span className="text-[12px] leading-4 text-muted">{t('feedback.duplicates.hint')}</span>
    </section>
  );
}
