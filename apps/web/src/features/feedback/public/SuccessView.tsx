import type { PublicFeedbackResult } from '@kite/shared';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { CheckIcon, CopyIcon, PaperclipIcon, PlusIcon } from './publicIcons';
import { TYPE_TINT } from './typeTint';

const STEPS = ['review', 'ask', 'hear'] as const;

/** The success scene: reference number, what was sent, next steps, "Submit another". */
export function SuccessView({
  result,
  onAgain,
}: {
  result: PublicFeedbackResult;
  onAgain: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const copy = () => {
    // `navigator.clipboard` is missing outside secure contexts: the chain catches that too.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(result.ref))
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        // Clipboard blocked: the number stays on screen to copy by hand.
      });
  };

  return (
    <main className="mx-auto mt-[clamp(16px,6vw,64px)] max-w-[560px]">
      <div className="rounded-[16px] border border-default bg-surface p-[clamp(24px,6vw,44px)] text-center shadow-form">
        <span
          aria-hidden="true"
          className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--fb-feedback-bg)] text-[var(--fb-feedback-fg)] shadow-[0_0_0_8px_var(--fb-success-ring)]"
        >
          <CheckIcon size={26} strokeWidth={2.6} />
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="m-0 mt-6 text-[clamp(22px,5.5vw,28px)] leading-[1.25] font-semibold tracking-[-0.02em] text-balance focus-visible:outline-none"
        >
          {t('feedbackPublic.okTitle')}
        </h1>
        <p className="mx-auto mt-2.5 mb-0 max-w-[420px] text-[15px] leading-[23px] text-pretty text-3">
          <Trans
            i18nKey="feedbackPublic.okBody"
            values={{ email: result.email }}
            components={{
              strong: <strong className="font-semibold [overflow-wrap:anywhere] text-default" />,
            }}
          />
        </p>

        <div className="mx-auto mt-6 flex max-w-[360px] items-center justify-between gap-3 rounded-[12px] border border-default bg-subtle py-3.5 pr-3.5 pl-[18px] text-left">
          <div>
            <p className="m-0 text-[12px] text-muted">{t('feedbackPublic.refLabel')}</p>
            <p className="m-0 mt-0.5 font-mono text-[22px] leading-7 font-medium tracking-[0.02em]">
              {result.ref}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            aria-label={
              copied
                ? t('feedbackPublic.copiedAria', { ref: result.ref })
                : t('feedbackPublic.copyAria', { ref: result.ref })
            }
            className="inline-flex h-9 flex-none items-center gap-1.5 rounded-[9px] border border-default bg-surface px-3 text-[13px] font-medium text-2 hover:bg-hover"
          >
            {copied ? (
              <CheckIcon size={14} strokeWidth={2.6} className="text-success" />
            ) : (
              <CopyIcon size={14} />
            )}
            {copied ? t('feedbackPublic.copied') : t('feedbackPublic.copy')}
          </button>
        </div>
        <p className="m-0 mt-2 text-[12px] text-muted">{t('feedbackPublic.refHelp')}</p>

        <div className="mt-6 rounded-[12px] border border-default px-4 py-3.5 text-left">
          <p className="m-0 mb-2 text-[12px] font-medium text-muted">
            {t('feedbackPublic.youSent')}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex h-[22px] flex-none items-center rounded-[6px] px-2 text-[12px] font-medium',
                TYPE_TINT[result.type],
              )}
            >
              {t(`feedback.type.${result.type}`)}
            </span>
            <span className="min-w-0 truncate text-[14px] font-medium">{result.title}</span>
          </div>
          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
            <PaperclipIcon size={12} className="flex-none" />
            {t('feedbackPublic.sentFiles', { count: result.attachmentCount })} ·{' '}
            {t('feedbackPublic.sentAt')}
          </p>
        </div>

        <ol className="m-0 mt-6 flex list-none flex-col gap-3 p-0 text-left">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink"
              >
                {i + 1}
              </span>
              <span className="text-[14px] leading-[21px] text-2">
                <strong className="font-semibold text-default">
                  {t(`feedbackPublic.steps.${step}.title`)}
                </strong>{' '}
                {t(`feedbackPublic.steps.${step}.text`)}
              </span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onAgain}
          className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-accent text-[15px] font-semibold text-white hover:brightness-110"
        >
          <PlusIcon size={16} />
          {t('feedbackPublic.again')}
        </button>
        <p className="m-0 mt-3.5 text-[12px] text-muted">{t('feedbackPublic.keptContact')}</p>
      </div>
    </main>
  );
}
