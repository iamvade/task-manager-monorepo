import { canManageCreated } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate, useParams } from 'react-router';
import { useDeleteSpace } from '../../api/spaces';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import { MoreIcon, TrashIcon } from '../../components/icons';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { useCopyLink } from '../../lib/useCopyLink';
import { toast } from '../../stores/toast';
import { ApiError } from '../../api/client';
import { Breadcrumb } from '../views/Breadcrumb';
import { HeaderSkeleton } from '../views/HeaderSkeleton';
import { PageHeader } from '../views/PageHeader';
import { ShareButton } from '../views/ShareButton';
import { useCurrentView } from '../views/useCurrentView';
import { ViewTabs } from '../views/ViewTabs';
import { ViewToolbar } from '../views/ViewToolbar';
import { FilterStrip } from '../project/FilterStrip';

/** /s/:spaceId/* — "[P] Product › All projects" top bar (Calendar.dc.html) around the view. */
export function SpaceLayout() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const view = useCurrentView();
  const { copied, copy } = useCopyLink();
  const navigate = useNavigate();
  const deleteSpace = useDeleteSpace(workspace?.id ?? '');
  const { me } = useAuth();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  if (sidebar.isPending) return <HeaderSkeleton />;
  if (sidebar.isError) return <ErrorState error={sidebar.error} />;
  const space = sidebar.data.spaces.find((s) => s.id === spaceId);
  // Admins, or the member who created the space (the API checks the same rule).
  const canDelete =
    space !== undefined &&
    workspace !== undefined &&
    me != null &&
    canManageCreated(workspace.role, space.createdById, me.user.id);
  if (!space) return <ErrorState error={new ApiError(404, 'NOT_FOUND', 'Space not found')} />;

  function onDelete(target: { id: string; name: string }) {
    setPendingDelete(null);
    // 409 SPACE_NOT_EMPTY and other errors toast from the mutation cache.
    deleteSpace
      .mutateAsync(target.id)
      .then(() => {
        toast({ message: t('header.spaceDeleted', { name: target.name }) });
        void navigate('/my-tasks');
      })
      .catch(() => undefined);
  }

  const items: MenuItem[] = [
    { id: 'copy', label: t('header.copyLink'), onSelect: () => void copy() },
    ...(canDelete
      ? ([
          { type: 'separator', id: 'sep-delete' },
          {
            id: 'delete',
            label: t('header.deleteSpace'),
            icon: <TrashIcon size={14} />,
            danger: true,
            onSelect: () => {
              setPendingDelete(space);
            },
          },
        ] satisfies MenuItem[])
      : []),
  ];

  return (
    <>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('header.deleteSpaceConfirm', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('header.deleteSpace')}
        tone="danger"
        pending={deleteSpace.isPending}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />
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
              items={items}
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
      <FilterStrip spaceId={space.id} />
      <Outlet context={space} />
    </>
  );
}
