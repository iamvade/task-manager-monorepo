import type { PublicFeedbackResult } from '@kite/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ApiError } from '../../../api/client';
import { usePublicFeedbackForm } from '../../../api/feedback';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { FeedbackForm, type Contact } from './FeedbackForm';
import { SuccessView } from './SuccessView';

const NO_CONTACT: Contact = { name: '', email: '', phone: '' };

/**
 * `/feedback/:slug`: the public form (PublicFeedback.dc.html), no account and no app shell.
 * After sending it shows the reference; "Submit another" starts over with the contact kept.
 */
export function PublicFeedbackPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const query = usePublicFeedbackForm(slug);
  const [result, setResult] = useState<PublicFeedbackResult | null>(null);
  const [contact, setContact] = useState<Contact>(NO_CONTACT);
  /** Remounts the form for "Submit another" (and then focuses its heading). */
  const [round, setRound] = useState(0);

  const workspaceName = query.data?.workspaceName;
  useEffect(() => {
    const previous = document.title;
    document.title = workspaceName
      ? t('feedbackPublic.docTitle', { workspace: workspaceName })
      : 'Kite';
    return () => {
      document.title = previous;
    };
  }, [workspaceName, t]);

  if (query.isPending) {
    return (
      <PageFrame workspaceName={null}>
        <main aria-busy="true" className="mx-auto mt-[clamp(12px,4vw,40px)] max-w-[720px]">
          <span className="sr-only">{t('feedbackPublic.loading')}</span>
          <div className="flex flex-col items-center gap-3">
            <Skeleton width={220} height={26} className="rounded-full" />
            <Skeleton width="80%" height={34} />
            <Skeleton width="60%" height={16} />
          </div>
          <div className="mt-7 flex flex-col gap-4 rounded-[16px] border border-default bg-surface p-[clamp(20px,5vw,40px)] shadow-form">
            <Skeleton width={160} height={16} />
            <Skeleton height={96} className="rounded-[12px]" />
            <Skeleton height={46} className="rounded-[10px]" />
            <Skeleton height={156} className="rounded-[10px]" />
          </div>
        </main>
      </PageFrame>
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <PageFrame workspaceName={null}>
        <main className="flex">
          {notFound ? (
            <EmptyState
              as="h1"
              title={t('feedbackPublic.notFoundTitle')}
              body={t('feedbackPublic.notFoundBody')}
            />
          ) : (
            <ErrorState
              error={query.error}
              onRetry={() => {
                void query.refetch();
              }}
            />
          )}
        </main>
      </PageFrame>
    );
  }

  const form = query.data;
  return (
    <PageFrame workspaceName={form.workspaceName}>
      {result ? (
        <SuccessView
          result={result}
          onAgain={() => {
            setResult(null);
            setRound((n) => n + 1);
          }}
        />
      ) : (
        <FeedbackForm
          key={round}
          slug={slug}
          form={form}
          initialContact={contact}
          focusHeading={round > 0}
          onSent={(sent, kept) => {
            setContact(kept);
            setResult(sent);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </PageFrame>
  );
}

/** Accent-washed page, the workspace header and the "Powered by Kite" footer. */
function PageFrame({
  workspaceName,
  children,
}: {
  workspaceName: string | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const initial = workspaceName ? workspaceName.trim().charAt(0).toUpperCase() : '';
  return (
    <div className="min-h-screen bg-subtle bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_8%,var(--bg-subtle))_0px,var(--bg-subtle)_440px)] px-4 pb-10 text-[15px] leading-[22px] text-default">
      <header className="mx-auto flex h-16 max-w-[720px] items-center gap-2.5">
        {workspaceName !== null && (
          <>
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-[9px] bg-accent text-[16px] font-semibold text-white"
            >
              {initial}
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{workspaceName}</span>
          </>
        )}
      </header>
      {children}
      {workspaceName !== null && (
        <footer className="mx-auto mt-7 flex max-w-[720px] flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
          <span>{t('feedbackPublic.powered', { workspace: workspaceName })}</span>
        </footer>
      )}
    </div>
  );
}
