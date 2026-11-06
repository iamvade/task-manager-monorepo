import { useTranslation } from 'react-i18next';
import { Switch } from '../../components/ui/Switch';
import { usePushSetting } from '../../push/usePush';
import { SettingsSection } from './SettingsRow';

/**
 * Settings → Notifications, "This device": Web Push in this browser (not designed; built like the
 * switches above). Hidden when the server has no VAPID keys; where push can't work here (plain
 * http, iPhone outside a Home Screen app, blocked) the hint says why and the switch is off.
 */
export function PushSection() {
  const { t } = useTranslation();
  const push = usePushSetting();
  if (push.state === 'loading' || push.state === 'off') return null;

  const hint =
    push.state === 'ready'
      ? t('settings.notifications.push.hint')
      : t(`settings.notifications.push.${push.state}`);

  return (
    <SettingsSection
      title={t('settings.notifications.push.title')}
      description={t('settings.notifications.push.intro')}
    >
      <div className="border-t border-subtle py-3.5">
        <Switch
          checked={push.on}
          disabled={push.state !== 'ready' || push.busy}
          onChange={push.setOn}
          label={t('settings.notifications.push.label')}
          hint={hint}
          placement="end"
        />
      </div>
    </SettingsSection>
  );
}
