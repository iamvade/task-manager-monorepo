import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import { MoreIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { useCopyLink } from '../../lib/useCopyLink';
import { ApiError } from '../../api/client';
import { Breadcrumb } from '../views/Breadcrumb';
import { HeaderSkeleton } from '../views/HeaderSkeleton';
import { PageHeader } from '../views/PageHeader';
import { ShareButton } from '../views/ShareButton';
import { useCurrentView } from '../views/useCurrentView';
import { ViewTabs } from '../views/ViewTabs';
import { ViewToolbar } from '../views/ViewToolbar';

/** /s/:spaceId/* — "[P] Product › All projects" top bar (Calendar.dc.html) around the view. */
export function SpaceLayout() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const view = useCurrentView();
  const { copied, copy } = useCopyLink();

  if (sidebar.isPending) return <HeaderSkeleton />;
  if (sidebar.isError) return <ErrorState error={sidebar.error} />;
  const space = sidebar.data.spaces.find((s) => s.id === spaceId);
  if (!space) return <ErrorState error={new ApiError(404, 'NOT_FOUND', 'Space not found')} />;

  return (
    <>
      <PageHeader
        title={<Breadcrumb space={space} current={t('header.allProjects')} />}
        actions={
          <>
            <ShareButton />
            <span role="status" className="sr-only">
              {copied ? t('header.linkCopied') : ''}
            </span>
            <Menu
              label={t('header.spaceOptions')}
              placement="bottom-end"
              items={[{ id: 'copy', label: t('header.copyLink'), onSelect: () => void copy() }]}
              trigger={(props) => (
                <IconButton
                  {...props}
                  label={t('header.spaceOptions')}
                  size={32}
                  icon={<MoreIcon size={16} />}
                />
              )}
            />
          </>
        }
        tabs={<ViewTabs basePath={`/s/${space.id}`} value={view} />}
        toolbar={<ViewToolbar />}
      />
      <Outlet context={space} />
    </>
  );
}
