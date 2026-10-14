import { NOTIFICATION_LEVELS, NOTIFICATION_TYPES } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useNotificationLevels, useSetNotificationLevel } from '../../api/notifications';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { ChevronDownIcon } from '../../components/icons';
import { Menu } from '../../components/ui/Menu';
import { ProjectDot } from '../../components/ui/ProjectDot';
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

/** Settings → Notifications, "Per project": a level per sidebar project (not designed). */
export function ProjectLevelsSection() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const levels = useNotificationLevels(workspace?.id);
  const setLevel = useSetNotificationLevel(workspace?.id);
  const spaces = sidebar.data?.spaces ?? [];

  return (
    <SettingsSection
      title={t('settings.notifications.perProject')}
      description={t('settings.notifications.perProjectHint')}
    >
      <ul className="m-0 list-none pl-0">
        {spaces.flatMap((space) =>
          space.projects.map((project) => {
            const level = levels.data?.get(project.id) ?? 'all';
            return (
              <li
                key={project.id}
                className="flex items-center gap-2 border-t border-subtle py-2.5 text-[13px]"
              >
                <ProjectDot color={project.color} size={8} />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="text-[12px] text-muted">{space.name}</span>
                <Menu
                  label={t('settings.notifications.levelOf', { project: project.name })}
                  placement="bottom-end"
                  items={NOTIFICATION_LEVELS.map((value) => ({
                    id: value,
                    label: t(`notifyLevel.${value}`),
                    checked: value === level,
                    onSelect: () => {
                      setLevel.mutate({ projectId: project.id, level: value });
                    },
                  }))}
                  trigger={(props) => (
                    <button
                      type="button"
                      {...props}
                      aria-label={t('settings.notifications.levelOf', { project: project.name })}
                      className="flex h-8 items-center gap-1.5 rounded-[8px] border border-control bg-control px-2.5 text-[13px] text-2 hover:bg-hover"
                    >
                      {t(`notifyLevel.${level}`)}
                      <ChevronDownIcon size={12} className="text-icon" />
                    </button>
                  )}
                />
              </li>
            );
          }),
        )}
      </ul>
    </SettingsSection>
  );
}
