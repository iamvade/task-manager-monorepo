import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsInput } from '../features/settings/SettingsRow';
import { cn } from '../lib/cn';
import { useCopyLink } from '../lib/useCopyLink';
import { Button } from './ui/Button';

/**
 * A freshly created invite (or password reset) link with Copy (Settings → Members, the admin
 * console). There is no email delivery and only the token's hash is stored, so this is the one
 * time it is shown. `label` and `note` replace the invite wording.
 */
export function InviteLink({
  email,
  link,
  label,
  note,
}: {
  email: string;
  link: string;
  label?: string;
  note?: string;
}) {
  const { t } = useTranslation();
  const linkId = useId();
  const { copied, copy } = useCopyLink();
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[8px] bg-subtle px-3 py-2.5">
      <label htmlFor={linkId} className="text-[13px] text-2">
        {label ?? t('settings.members.linkFor', { email })}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={linkId}
          type="text"
          readOnly
          value={link}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          className={cn(settingsInput, 'flex-[1_1_220px] font-mono text-[12px]')}
        />
        <Button
          onClick={() => {
            void copy(link);
          }}
        >
          {copied ? t('header.linkCopied') : t('header.copyLink')}
        </Button>
      </div>
      <p className="m-0 text-[12px] text-muted">{note ?? t('settings.members.linkOnce')}</p>
    </div>
  );
}
