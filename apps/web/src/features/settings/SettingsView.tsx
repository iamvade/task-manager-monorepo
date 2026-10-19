import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { useCurrentWorkspace } from '../../api/workspaces';
import { SettingsIcon } from '../../components/icons';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { PageHeader } from '../views/PageHeader';
import { ArchivedProjectsSection } from './ArchivedProjectsSection';
import { MembersSection } from './MembersSection';
import { NotificationsSection, ProjectLevelsSection } from './NotificationsSection';
import { PreferencesSection } from './PreferencesSection';
import { ProfileSection } from './ProfileSection';
import { SprintsSection } from './SprintsSection';
import { TagsSection } from './TagsSection';

const TABS = [
  'profile',
  'preferences',
  'notifications',
  'members',
  'tags',
  'sprints',
  'archived',
] as const;
const tabSchema = z.enum(TABS).catch('profile');

/** /settings (not designed; built from the design system): one section per `?tab=`. */
export function SettingsView() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const tab = tabSchema.parse(params.get('tab') ?? 'profile');
  const workspace = useCurrentWorkspace();

  return (
    <>
      <PageHeader
        title={
          <h1 className="m-0 flex min-w-0 items-center gap-2 text-[14px] leading-5 font-semibold">
            <SettingsIcon size={16} className="flex-none text-3" />
            <span className="truncate">{t('shell.settings')}</span>
          </h1>
        }
        tabs={
          <UnderlineTabs
            label={t('settings.tabsLabel')}
            value={tab}
            items={TABS.map((value) => ({
              value,
              label: t(`settings.tabs.${value}`),
              to: value === 'profile' ? '/settings' : `/settings?tab=${value}`,
            }))}
          />
        }
      />
      <div role="tabpanel" aria-label={t(`settings.tabs.${tab}`)} className="px-6 pt-6 pb-16">
        <div className="mx-auto w-full max-w-[680px]">
          {tab === 'profile' && <ProfileSection />}
          {tab === 'preferences' && <PreferencesSection />}
          {tab === 'notifications' && (
            <div className="flex flex-col gap-8">
              <NotificationsSection />
              <ProjectLevelsSection />
            </div>
          )}
          {tab === 'members' && workspace && (
            <MembersSection workspaceId={workspace.id} role={workspace.role} />
          )}
          {tab === 'tags' && workspace && (
            <TagsSection workspaceId={workspace.id} role={workspace.role} />
          )}
          {tab === 'sprints' && workspace && (
            <SprintsSection workspaceId={workspace.id} role={workspace.role} />
          )}
          {tab === 'archived' && workspace && (
            <ArchivedProjectsSection workspaceId={workspace.id} role={workspace.role} />
          )}
        </div>
      </div>
    </>
  );
}
