import { NOTIFICATION_TYPES } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useSaveMe } from '../../api/useSaveMe';
import { useAuth } from '../../auth/useAuth';
import { Switch } from '../../components/ui/Switch';
import { SettingsSection } from './SettingsRow';

/** Per-type toggles of `notification_prefs` (checked when notifications fan out). */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const save = useSaveMe();
  if (!me) return null;
  const prefs = me.preferences.notificationPrefs;

  return (
    <SettingsSection
      title={t('settings.tabs.notifications')}
      description={t('settings.notifications.intro')}
    >
      {NOTIFICATION_TYPES.map((type) => (
        <div key={type} className="border-t border-subtle py-3.5">
          <Switch
            checked={prefs[type]}
            onChange={(on) => {
              save({ notificationPrefs: { [type]: on } });
            }}
            label={t(`settings.notifications.${type}`)}
            hint={t(`settings.notifications.${type}Hint`)}
            placement="end"
          />
        </div>
      ))}
    </SettingsSection>
  );
}
