import { useId, type ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled group of rows (14/600 heading, 13px muted description). */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <div className="flex flex-col gap-1 pb-2">
        <h2 id={id} className="m-0 text-[14px] leading-5 font-semibold">
          {title}
        </h2>
        {description && <p className="m-0 text-[13px] leading-5 text-muted">{description}</p>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  hint?: string;
  /** Id of the control the label names (for inputs); groups use `labelId` via aria-labelledby. */
  htmlFor?: string;
  labelId?: string;
  children: ReactNode;
}

/**
 * One setting: label (13/500) + hint (12px muted) on the left, the control on the right;
 * wraps under the label when the row gets narrow (long Mongolian labels).
 */
export function SettingsRow({ label, hint, htmlFor, labelId, children }: SettingsRowProps) {
  const LabelTag = htmlFor ? 'label' : 'span';
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-subtle py-3.5">
      <div className="flex min-w-[200px] flex-[1_1_240px] flex-col gap-0.5">
        <LabelTag id={labelId} htmlFor={htmlFor} className="text-[13px] font-medium text-default">
          {label}
        </LabelTag>
        {hint && <span className="text-[12px] leading-4 text-muted">{hint}</span>}
      </div>
      <div className="flex max-w-full min-w-0 flex-none flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

/** Input styled like TextField's field (38px → 32px here to sit in a row). */
export const settingsInput =
  'box-border h-8 w-[260px] max-w-full rounded-[8px] border border-control bg-control px-3 text-[13px] text-default outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink';
