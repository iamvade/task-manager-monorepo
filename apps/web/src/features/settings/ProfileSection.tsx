import { AVATAR_COLORS, nameSchema, type AvatarColor } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveMe } from '../../api/useSaveMe';
import { useAuth } from '../../auth/useAuth';
import { CheckIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';
import { SettingsRow, SettingsSection, settingsInput } from './SettingsRow';

export function ProfileSection() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const save = useSaveMe();
  const nameId = useId();
  const colorLabelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const name = draft ?? me.user.name;

  function commitName() {
    if (draft === null || !me) return;
    const parsed = nameSchema.safeParse(draft);
    if (!parsed.success) {
      setError(t('settings.profile.nameInvalid'));
      return;
    }
    setError(null);
    setDraft(null);
    if (parsed.data !== me.user.name) save({ name: parsed.data });
  }

  return (
    <SettingsSection title={t('settings.tabs.profile')}>
      <div className="flex items-center gap-3 pb-4">
        <Avatar user={me.user} size={40} textSize={14} title={null} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold">{me.user.name}</span>
          <span className="truncate text-[13px] text-muted">{me.user.email}</span>
        </div>
      </div>
      <SettingsRow
        label={t('settings.profile.name')}
        hint={t('settings.profile.nameHint')}
        htmlFor={nameId}
      >
        <div className="flex flex-col gap-1">
          <input
            id={nameId}
            value={name}
            maxLength={80}
            autoComplete="name"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${nameId}-error` : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setDraft(null);
                setError(null);
              }
            }}
            className={cn(settingsInput, error && 'border-danger')}
          />
          {error && (
            <span id={`${nameId}-error`} className="text-[12px] text-danger">
              {error}
            </span>
          )}
        </div>
      </SettingsRow>
      <SettingsRow
        label={t('settings.profile.avatarColor')}
        hint={t('settings.profile.avatarColorHint')}
        labelId={colorLabelId}
      >
        <ColorSwatches
          labelledBy={colorLabelId}
          initials={me.user.initials}
          value={me.user.avatarColor}
          onChange={(avatarColor) => {
            save({ avatarColor });
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.profile.email')} hint={t('settings.profile.emailHint')}>
        <span className="text-[13px] text-2">{me.user.email}</span>
      </SettingsRow>
    </SettingsSection>
  );
}

interface ColorSwatchesProps {
  labelledBy: string;
  initials: string;
  value: string;
  onChange: (color: AvatarColor) => void;
}

/** The 8 avatar colors as a radio group of initials chips; arrow keys move the choice. */
function ColorSwatches({ labelledBy, initials, value, onChange }: ColorSwatchesProps) {
  const { t } = useTranslation();
  const move = (from: number, step: number) => {
    const next = AVATAR_COLORS[(from + step + AVATAR_COLORS.length) % AVATAR_COLORS.length];
    if (next) onChange(next);
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
      {AVATAR_COLORS.map((color, i) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`settings.colors.${color}`)}
            title={t(`settings.colors.${color}`)}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(color);
            }}
            onKeyDown={(e) => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              move(i, step);
              const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
              buttons?.[(i + step + AVATAR_COLORS.length) % AVATAR_COLORS.length]?.focus();
            }}
            className={cn(
              'pal-fill relative flex size-7 items-center justify-center rounded-full border-0 p-0 text-[10px] font-semibold',
              paletteClass('avatar', color),
              selected && 'outline-2 outline-offset-2 outline-accent-ink',
            )}
          >
            {selected ? <CheckIcon size={14} strokeWidth={2.5} /> : initials}
          </button>
        );
      })}
    </div>
  );
}
