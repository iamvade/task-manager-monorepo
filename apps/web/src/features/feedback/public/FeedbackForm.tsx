import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_FIELD_ERRORS,
  FEEDBACK_TITLE_MAX,
  validateFeedbackForm,
  type FeedbackFieldError,
  type FeedbackFormField,
  type FeedbackType,
  type PublicFeedbackForm,
  type PublicFeedbackResult,
} from '@kite/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../api/client';
import { submitPublicFeedback } from '../../../api/feedback';
import { cn } from '../../../lib/cn';
import { Attachments } from './Attachments';
import { FieldError } from './FieldError';
import { AlertCircleIcon, InfoIcon, LockIcon } from './publicIcons';
import { TypeSelector } from './TypeSelector';
import { TYPE_TINT } from './typeTint';
import { useUploads } from './useUploads';

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

type Errors = Partial<Record<FeedbackFormField, FeedbackFieldError>>;

/** Summary order: the form's order. */
const FIELDS: readonly FeedbackFormField[] = ['type', 'title', 'body', 'name', 'email', 'phone'];
const FIELD_ID: Record<FeedbackFormField, string> = {
  type: 'fb-type',
  title: 'fb-title',
  body: 'fb-body',
  name: 'fb-name',
  email: 'fb-email',
  phone: 'fb-phone',
};

const isField = (key: string): key is FeedbackFormField =>
  (FIELDS as readonly string[]).includes(key);
const isFieldError = (code: string): code is FeedbackFieldError =>
  (FEEDBACK_FIELD_ERRORS as readonly string[]).includes(code);

/** `error.fields` of a 400, keeping the fields and codes the form knows. */
function serverFieldErrors(fields: Readonly<Record<string, string>>): Errors {
  const errors: Errors = {};
  for (const [field, code] of Object.entries(fields)) {
    if (isField(field) && isFieldError(code)) errors[field] = code;
  }
  return errors;
}

function focusField(field: FeedbackFormField) {
  if (field === 'type') {
    const radio =
      document.querySelector<HTMLInputElement>('#fb-type input:checked') ??
      document.querySelector<HTMLInputElement>('#fb-type input');
    radio?.focus();
    return;
  }
  document.getElementById(FIELD_ID[field])?.focus();
}

const clientInfo = () => ({
  screen: `${String(window.screen.width)}×${String(window.screen.height)}`,
  viewport: `${String(window.innerWidth)}×${String(window.innerHeight)}`,
  language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

const inputBase =
  'block w-full rounded-[10px] border bg-control px-3.5 text-[15px] text-default placeholder:text-muted';
const inputState = (invalid: boolean) =>
  invalid
    ? 'border-[var(--field-error-border)] shadow-[0_0_0_3px_var(--field-error-ring)]'
    : 'border-control';

interface FeedbackFormProps {
  slug: string;
  form: PublicFeedbackForm;
  initialContact: Contact;
  /** Focus the heading on mount ("Submit another"). */
  focusHeading: boolean;
  onSent: (result: PublicFeedbackResult, contact: Contact) => void;
}

/** The form scene of PublicFeedback.dc.html (also its errors and loading scenes). */
export function FeedbackForm({
  slug,
  form,
  initialContact,
  focusHeading,
  onSent,
}: FeedbackFormProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState(initialContact.name);
  const [email, setEmail] = useState(initialContact.email);
  const [phone, setPhone] = useState(initialContact.phone);
  const [website, setWebsite] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  /** `waiting`: sent while files were still uploading; goes out when they finish. */
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'sending'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const errorsAtSubmit = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const uploads = useUploads(slug, form, {
    onSettled: (now) => {
      if (phase !== 'waiting') return;
      // The fields stay editable while waiting (so a stuck upload can be cancelled): check again.
      if (Object.keys(clientErrors).length > 0) {
        setPhase('idle');
        setFocusTick((n) => n + 1);
        return;
      }
      if (now.errorCount > errorsAtSubmit.current) {
        setPhase('idle');
        setFormError(t('feedbackPublic.uploadsFailed'));
        return;
      }
      void send(now.uploads);
    },
    announce: (kind, fileName) => {
      setAnnouncement(
        kind === 'done'
          ? t('feedbackPublic.announceDone', { name: fileName })
          : t('feedbackPublic.announceUploading', { name: fileName }),
      );
    },
  });

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);
  useEffect(() => {
    if (focusTick > 0) summaryRef.current?.focus();
  }, [focusTick]);

  const values = { type, title, body, name, email, phone };
  const clientErrors = validateFeedbackForm(values);
  const errors: Errors = attempted && phase === 'idle' ? { ...serverErrors, ...clientErrors } : {};
  const errorText = (field: FeedbackFormField) => {
    const code = errors[field];
    return code
      ? t(`feedbackPublic.err.${code}`, {
          max: code === 'bodyTooLong' ? FEEDBACK_BODY_MAX : FEEDBACK_TITLE_MAX,
          min: FEEDBACK_BODY_MIN,
        })
      : null;
  };
  const summary = FIELDS.flatMap((field) => {
    const code = errors[field];
    return code ? [{ field, text: t(`feedbackPublic.sum.${code}`) }] : [];
  });

  /** A field edit drops the server's verdict on it (the client's own check stays live). */
  const edit =
    <V,>(field: FeedbackFormField, set: (value: V) => void) =>
    (value: V) => {
      set(value);
      if (serverErrors[field]) {
        setServerErrors(({ [field]: _dropped, ...rest }) => rest);
      }
    };

  const busy = phase !== 'idle';
  /** Only the request itself locks the form; while files finish uploading they can still be removed. */
  const locked = phase === 'sending';

  async function send(files: { id: string; token: string }[]) {
    setPhase('sending');
    setFormError(null);
    try {
      const result = await submitPublicFeedback(slug, {
        type,
        title,
        body,
        name,
        email,
        phone,
        uploads: files,
        client: clientInfo(),
        website,
      });
      uploads.reset();
      onSent(result, { name, email, phone });
    } catch (error) {
      setPhase('idle');
      if (error instanceof ApiError) {
        if (error.status === 400 && error.fields) {
          const mapped = serverFieldErrors(error.fields);
          if (Object.keys(mapped).length > 0) {
            setServerErrors(mapped);
            setFocusTick((n) => n + 1);
            return;
          }
        }
        if (error.status === 429) {
          setFormError(
            error.retryAfter
              ? t('feedbackPublic.rateLimited', { count: Math.ceil(error.retryAfter / 60) })
              : t('feedbackPublic.rateLimitedSoon'),
          );
          return;
        }
      }
      setFormError(t('feedbackPublic.sendFailed'));
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    setServerErrors({});
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) {
      setFocusTick((n) => n + 1);
      return;
    }
    if (uploads.busy) {
      errorsAtSubmit.current = uploads.errorCount;
      setPhase('waiting');
      return;
    }
    void send(uploads.uploads);
  };

  const titleError = errorText('title');
  const bodyError = errorText('body');
  const nameError = errorText('name');
  const emailError = errorText('email');
  const phoneError = errorText('phone');

  return (
    <main>
      <div className="mx-auto mt-[clamp(12px,4vw,40px)] max-w-[640px] text-center">
        <p className="m-0 mb-3 inline-flex h-[26px] items-center gap-1.5 rounded-full border border-default bg-surface px-2.5 text-[12px] font-medium text-3">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          {t('feedbackPublic.eyebrow')}
        </p>
        <h1
          id="fb-heading"
          ref={headingRef}
          tabIndex={-1}
          className="m-0 text-[clamp(24px,6vw,34px)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance focus-visible:outline-none"
        >
          {t('feedbackPublic.heading')}
        </h1>
        <p className="mx-auto mt-3 mb-0 max-w-[520px] text-[15px] leading-[23px] text-pretty text-3">
          {t('feedbackPublic.sub', { workspace: form.workspaceName })}
        </p>
      </div>

      <form
        noValidate
        aria-labelledby="fb-heading"
        aria-busy={busy}
        onSubmit={onSubmit}
        className="mx-auto mt-7 max-w-[720px] rounded-[16px] border border-default bg-surface p-[clamp(20px,5vw,40px)] shadow-form"
      >
        {summary.length > 0 && (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            aria-labelledby="fb-summary-title"
            className="mb-7 flex gap-3 rounded-[12px] border border-[var(--form-error-border)] bg-[var(--form-error-bg)] px-4 py-3.5"
          >
            <AlertCircleIcon
              size={20}
              strokeWidth={2}
              className="mt-px flex-none text-danger-soft"
            />
            <div className="min-w-0">
              <p
                id="fb-summary-title"
                className="m-0 text-[14px] font-semibold text-[var(--form-error-title)]"
              >
                {t('feedbackPublic.summaryTitle', { count: summary.length })}
              </p>
              <ul className="m-0 mt-1.5 list-disc pl-[18px] text-[14px] leading-[22px] text-danger-soft">
                {summary.map(({ field, text }) => (
                  <li key={field}>
                    <a
                      href={`#${FIELD_ID[field]}`}
                      onClick={(e) => {
                        e.preventDefault();
                        focusField(field);
                      }}
                      className="text-danger-soft underline underline-offset-2"
                    >
                      {text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <fieldset
          disabled={locked}
          className={cn('m-0 flex min-w-0 flex-col gap-7 border-0 p-0', locked && 'opacity-60')}
        >
          <TypeSelector
            value={type}
            error={errors.type ? t(`feedbackPublic.err.${errors.type}`) : null}
            onChange={edit('type', setType)}
          />

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <label htmlFor="fb-title" className="text-[14px] font-semibold">
                {t('feedbackPublic.titleLabel')}{' '}
                <span aria-hidden="true" className="text-danger-soft">
                  *
                </span>
              </label>
              <span
                aria-hidden="true"
                className={cn(
                  'text-[12px] tabular-nums',
                  title.length > FEEDBACK_TITLE_MAX - 10 ? 'text-warning' : 'text-muted',
                )}
              >
                {title.length}/{FEEDBACK_TITLE_MAX}
              </span>
            </div>
            <input
              id="fb-title"
              type="text"
              maxLength={FEEDBACK_TITLE_MAX}
              required
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? 'fb-title-err' : undefined}
              value={title}
              onChange={(e) => {
                edit('title', setTitle)(e.target.value);
              }}
              placeholder={t(`feedbackPublic.titlePh.${type ?? 'bug'}`)}
              className={cn(inputBase, 'h-[46px]', inputState(!!titleError))}
            />
            {titleError && <FieldError id="fb-title-err">{titleError}</FieldError>}
          </div>

          <div>
            <label htmlFor="fb-body" className="mb-1 block text-[14px] font-semibold">
              {t('feedbackPublic.bodyLabel')}{' '}
              <span aria-hidden="true" className="text-danger-soft">
                *
              </span>
            </label>
            <p
              id="fb-body-hint"
              className="m-0 mb-2.5 flex items-start gap-2 text-[13px] leading-[19px] text-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-px inline-flex size-[18px] flex-none items-center justify-center rounded-[5px]',
                  TYPE_TINT[type ?? 'other'],
                )}
              >
                <InfoIcon size={12} />
              </span>
              <span>{t(`feedbackPublic.bodyHint.${type ?? 'none'}`)}</span>
            </p>
            <textarea
              id="fb-body"
              rows={6}
              required
              aria-invalid={bodyError ? true : undefined}
              aria-describedby={bodyError ? 'fb-body-hint fb-body-err' : 'fb-body-hint'}
              value={body}
              onChange={(e) => {
                edit('body', setBody)(e.target.value);
              }}
              placeholder={type ? t(`feedbackPublic.bodyPh.${type}`) : undefined}
              className={cn(
                inputBase,
                'min-h-[156px] resize-y py-3 leading-[23px]',
                inputState(!!bodyError),
              )}
            />
            {bodyError && <FieldError id="fb-body-err">{bodyError}</FieldError>}
          </div>

          <Attachments
            items={uploads.items}
            maxFiles={form.maxFiles}
            maxFileBytes={form.maxFileBytes}
            limitHit={uploads.limitHit}
            disabled={locked}
            onAdd={uploads.add}
            onRemove={uploads.remove}
          />

          <div className="border-t border-default pt-6">
            <h2 className="m-0 text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">
              {t('feedbackPublic.contactTitle')}
            </h2>
            <p className="m-0 mt-1 mb-4 text-[13px] leading-[19px] text-muted">
              {t('feedbackPublic.contactSub')}
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
              <div>
                <label htmlFor="fb-name" className="mb-2 block text-[14px] font-semibold">
                  {t('feedbackPublic.nameLabel')}{' '}
                  <span className="font-normal text-muted">{t('feedbackPublic.optional')}</span>
                </label>
                <input
                  id="fb-name"
                  type="text"
                  autoComplete="name"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'fb-name-err' : undefined}
                  value={name}
                  onChange={(e) => {
                    edit('name', setName)(e.target.value);
                  }}
                  placeholder={t('feedbackPublic.namePh')}
                  className={cn(inputBase, 'h-[46px]', inputState(!!nameError))}
                />
                {nameError && <FieldError id="fb-name-err">{nameError}</FieldError>}
              </div>
              <div>
                <label htmlFor="fb-email" className="mb-2 block text-[14px] font-semibold">
                  {t('feedbackPublic.emailLabel')}{' '}
                  <span aria-hidden="true" className="text-danger-soft">
                    *
                  </span>
                </label>
                <input
                  id="fb-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby="fb-email-msg"
                  value={email}
                  onChange={(e) => {
                    edit('email', setEmail)(e.target.value);
                  }}
                  placeholder="name@email.com"
                  className={cn(inputBase, 'h-[46px]', inputState(!!emailError))}
                />
                {emailError ? (
                  <FieldError id="fb-email-msg">{emailError}</FieldError>
                ) : (
                  <p id="fb-email-msg" className="m-0 mt-2 text-[12px] leading-[17px] text-muted">
                    {t('feedbackPublic.emailHelp')}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="fb-phone" className="mb-2 block text-[14px] font-semibold">
                  {t('feedbackPublic.phoneLabel')}{' '}
                  <span className="font-normal text-muted">{t('feedbackPublic.optional')}</span>
                </label>
                <input
                  id="fb-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? 'fb-phone-err' : undefined}
                  value={phone}
                  onChange={(e) => {
                    edit('phone', setPhone)(e.target.value);
                  }}
                  placeholder="9911 2233"
                  className={cn(inputBase, 'h-[46px]', inputState(!!phoneError))}
                />
                {phoneError && <FieldError id="fb-phone-err">{phoneError}</FieldError>}
              </div>
            </div>
          </div>

          {/* Honeypot: people never see it; bots that fill every field give themselves away. */}
          <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
            <label htmlFor="fb-website">{t('feedbackPublic.honeypot')}</label>
            <input
              id="fb-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
              }}
            />
          </div>
        </fieldset>

        <div className="mt-8">
          {formError && (
            <div
              role="alert"
              className="mb-4 flex gap-3 rounded-[12px] border border-[var(--form-error-border)] bg-[var(--form-error-bg)] px-4 py-3 text-[14px] leading-[21px] text-danger-soft"
            >
              <AlertCircleIcon size={20} strokeWidth={2} className="mt-px flex-none" />
              <span>{formError}</span>
            </div>
          )}
          <button
            type="submit"
            aria-disabled={busy || undefined}
            className={cn(
              'inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-accent text-[15px] font-semibold text-white',
              busy ? 'cursor-progress opacity-85' : 'hover:brightness-110',
            )}
          >
            {busy && <Spinner />}
            <span>{busy ? t('feedbackPublic.submitting') : t('feedbackPublic.submit')}</span>
          </button>
          <p
            role="status"
            className="m-0 mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] leading-[17px] text-muted"
          >
            <LockIcon size={12} className="flex-none" />
            {phase === 'waiting' || (busy && uploads.uploads.length > 0)
              ? t('feedbackPublic.footBusy')
              : t('feedbackPublic.foot')}
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
      </form>
    </main>
  );
}

/** The submit button's spinner. */
function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity={0.3} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
