import { FEEDBACK_TYPES, type FeedbackType } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { FieldError } from './FieldError';
import { CheckIcon, TYPE_ICONS } from './publicIcons';
import { TYPE_TINT } from './typeTint';

interface TypeSelectorProps {
  value: FeedbackType | null;
  error: string | null;
  onChange: (type: FeedbackType) => void;
}

/** "What is this about?": four radio cards (native radios, so arrows move the choice). */
export function TypeSelector({ value, error, onChange }: TypeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div>
      <p id="fb-type-label" className="m-0 mb-2.5 text-[14px] font-semibold">
        {t('feedbackPublic.typeLabel')}{' '}
        <span aria-hidden="true" className="text-danger-soft">
          *
        </span>
        <span className="sr-only">{t('feedbackPublic.required')}</span>
      </p>
      <div
        id="fb-type"
        role="radiogroup"
        aria-labelledby="fb-type-label"
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'fb-type-err' : undefined}
        className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5"
      >
        {FEEDBACK_TYPES.map((type) => {
          const on = value === type;
          const Icon = TYPE_ICONS[type];
          return (
            <label
              key={type}
              className={cn(
                'relative flex cursor-pointer flex-col items-start gap-2.5 rounded-[12px] text-left',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent-ink',
                on
                  ? 'border-[1.5px] border-accent bg-accent-soft p-[13.5px]'
                  : cn(
                      'border bg-surface p-[14px] hover:bg-hover',
                      error ? 'border-[var(--type-card-error-border)]' : 'border-default',
                    ),
              )}
            >
              <input
                type="radio"
                name="fb-type"
                value={type}
                checked={on}
                onChange={() => {
                  onChange(type);
                }}
                aria-labelledby={`fb-type-${type}`}
                aria-describedby={`fb-type-${type}-desc`}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-[10px]',
                  TYPE_TINT[type],
                )}
              >
                <Icon size={20} />
              </span>
              <span className="block">
                <span
                  id={`fb-type-${type}`}
                  className="block text-[14px] leading-5 font-semibold text-default"
                >
                  {t(`feedback.type.${type}`)}
                </span>
                <span
                  id={`fb-type-${type}-desc`}
                  className={cn(
                    'mt-0.5 block text-[13px] leading-[18px]',
                    on ? 'text-3' : 'text-muted',
                  )}
                >
                  {t(`feedbackPublic.typeDesc.${type}`)}
                </span>
              </span>
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute top-3 right-3 inline-flex size-5 items-center justify-center rounded-full bg-accent text-white"
                >
                  <CheckIcon size={12} />
                </span>
              )}
            </label>
          );
        })}
      </div>
      {error && <FieldError id="fb-type-err">{error}</FieldError>}
    </div>
  );
}
