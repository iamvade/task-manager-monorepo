import { AVATAR_COLORS, nameSchema } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveMe } from '../../api/useSaveMe';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { ColorSwatches } from '../../components/ui/ColorSwatches';
import { cn } from '../../lib/cn';
import { AbsenceList } from './AbsenceList';
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
          colors={AVATAR_COLORS}
          family="avatar"
          labelledBy={colorLabelId}
          text={me.user.initials}
          value={me.user.avatarColor}
          onChange={(avatarColor) => {
            save({ avatarColor });
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.profile.email')} hint={t('settings.profile.emailHint')}>
        <span className="text-[13px] text-2">{me.user.email}</span>
      </SettingsRow>
      <OutOfOffice userId={me.user.id} />
    </SettingsSection>
  );
}

/** Out of office: my absences (badges in pickers, the standup strip and Workload). */
function OutOfOffice({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  if (!workspace) return null;
  return (
    <SettingsRow label={t('members.away.label')} hint={t('members.away.hint')}>
      <AbsenceList workspaceId={workspace.id} userId={userId} />
    </SettingsRow>
  );
}
