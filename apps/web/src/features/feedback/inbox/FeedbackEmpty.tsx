import { useTranslation } from 'react-i18next';
import { publicFeedbackUrl } from '../../../api/feedback';
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FeedbackIcon,
  LinkIcon,
  MailIcon,
} from '../../../components/icons';
import { cn } from '../../../lib/cn';
import { useCopy } from '../useCopy';

const WHERE = [
  {
    key: 'help',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  },
  { key: 'email', icon: null },
  { key: 'store', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z' },
] as const;

/** No feedback yet (FeedbackEmpty.dc.html): the public link to share and where to put it. */
export function FeedbackEmpty({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopy();
  const url = publicFeedbackUrl(slug);

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-14 pb-12">
      <div className="flex w-full max-w-[600px] flex-col items-center gap-6 text-center">
        <Illustration />
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.01em]">
            {t('feedback.empty.title')}
          </h2>
          <p className="m-0 text-[14px] leading-[22px] text-2">{t('feedback.empty.body')}</p>
        </div>

        <div className="flex w-full max-w-[480px] flex-col gap-2 text-left">
          <label htmlFor="fb-public-url" className="text-[12px] font-medium text-2">
            {t('feedback.empty.linkLabel')}
          </label>
          <div className="flex items-center gap-2 rounded-[10px] border border-default bg-subtle py-1.5 pr-1.5 pl-3">
            <LinkIcon size={14} className="flex-none text-icon" />
            <input
              id="fb-public-url"
              type="text"
              readOnly
              value={url}
              onFocus={(e) => {
                e.currentTarget.select();
              }}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[13px] text-body outline-none"
            />
            <button
              type="button"
              onClick={() => {
                copy(url);
              }}
              aria-live="polite"
              className={cn(
                'flex h-[34px] flex-none items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-semibold text-white',
                copied ? 'bg-[var(--success)]' : 'bg-accent hover:brightness-110',
              )}
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? t('feedback.inbox.copied') : t('feedback.empty.copy')}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-accent-ink hover:underline"
            >
              <ExternalLinkIcon size={13} />
              {t('feedback.empty.preview')}
            </a>
          </div>
        </div>

        <div className="mt-3 flex w-full flex-col gap-3 border-t border-subtle pt-6">
          <span className="text-[12px] font-medium text-muted">
            {t('feedback.empty.whereTitle')}
          </span>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2 p-0 text-left">
            {WHERE.map((w) => (
              <li
                key={w.key}
                className="flex flex-col gap-1.5 rounded-[10px] border border-subtle bg-subtle p-3"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-[8px] bg-accent-soft text-accent-ink"
                >
                  {w.icon ? (
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={w.icon} />
                    </svg>
                  ) : (
                    <MailIcon size={14} />
                  )}
                </span>
                <span className="text-[13px] font-semibold">
                  {t(`feedback.empty.where.${w.key}.title`)}
                </span>
                <span className="text-[12px] leading-4 text-muted">
                  {t(`feedback.empty.where.${w.key}.body`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** A public form card feeding the inbox (decorative). */
function Illustration() {
  const { t } = useTranslation();
  const chips = [
    ['bug', 'bug'],
    ['feature', 'idea'],
    ['feedback', 'feedback'],
  ] as const;
  return (
    <div aria-hidden="true" className="relative h-[150px] w-[320px]">
      <div className="absolute top-0 left-0 box-border flex w-[196px] flex-col gap-2 rounded-[12px] border border-default bg-surface p-3 text-left shadow-[var(--shadow-float)]">
        <span className="flex gap-1">
          {chips.map(([type, label]) => (
            <span
              key={type}
              className="flex h-4 items-center rounded-[4px] px-1.5 text-[9px] font-semibold"
              style={{ background: `var(--fb-${type}-bg)`, color: `var(--fb-${type}-fg)` }}
            >
              {t(`feedback.empty.illustration.${label}`)}
            </span>
          ))}
        </span>
        <span className="h-[22px] rounded-[5px] border border-default" />
        <span className="h-[34px] rounded-[5px] border border-default" />
        <span className="h-[18px] w-14 self-end rounded-[5px] bg-accent" />
      </div>
      <svg
        width={60}
        height={40}
        viewBox="0 0 60 40"
        fill="none"
        className="absolute top-16 left-[186px] text-[var(--border-strong)]"
      >
        <path
          d="M2 8c20 0 30 10 50 24"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
        <path
          d="m46 26 8 7-10 2"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="absolute right-0 bottom-0 flex size-[84px] items-center justify-center rounded-[20px] bg-accent-soft text-accent-ink">
        <FeedbackIcon size={36} strokeWidth={1.75} />
      </div>
    </div>
  );
}
