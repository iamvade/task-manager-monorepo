import type { ProjectDetail } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSetArchived, useToggleFavorite } from '../../api/projects';
import { useCurrentWorkspace } from '../../api/workspaces';
import { ArchiveIcon, MoreIcon, SprintIcon, StarIcon, UnarchiveIcon } from '../../components/icons';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { IconButton } from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import { useOnlineIds } from '../../stores/realtime';
import { useCopyLink } from '../../lib/useCopyLink';
import { toast } from '../../stores/toast';
import { Breadcrumb } from '../views/Breadcrumb';
import { PageHeader } from '../views/PageHeader';
import { ShareButton } from '../views/ShareButton';
import { ViewTabs } from '../views/ViewTabs';
import type { View } from '../views/views';
import { ViewToolbar } from '../views/ViewToolbar';
import { NewSprintDialog } from './NewSprintDialog';

/** Project top bar: breadcrumb, favorite, members, Share, options; view tabs + toolbar. */
export function ProjectHeader({ project, view }: { project: ProjectDetail; view: View }) {
  const { t } = useTranslation();
  const online = useOnlineIds();
  const favorite = useToggleFavorite(project);
  const { copied, copy } = useCopyLink();
  const [newSprintOpen, setNewSprintOpen] = useState(false);
  const favoriteLabel = project.isFavorite ? t('header.unfavorite') : t('header.favorite');
  const isAdmin = useCurrentWorkspace()?.role !== 'member';
  const setArchived = useSetArchived(project.workspaceId);
  const navigate = useNavigate();

  function archive() {
    const { id: projectId, name, spaceId } = project;
    // The error toast comes from the mutation cache.
    const failed = () => undefined;
    // Promises, not per-call callbacks: the header unmounts when the space list opens.
    setArchived
      .mutateAsync({ projectId, archived: true })
      .then(() => {
        void navigate(`/s/${spaceId}/list`);
        toast({
          message: t('header.projectArchived', { name }),
          action: {
            label: t('common.undo'),
            onClick: () => {
              setArchived.mutateAsync({ projectId, archived: false }).catch(failed);
            },
          },
        });
      })
      .catch(failed);
  }

  const archiveItems: MenuItem[] = !isAdmin
    ? []
    : project.archivedAt
      ? [
          {
            id: 'restore',
            label: t('header.restoreProject'),
            icon: <UnarchiveIcon size={14} />,
            onSelect: () => {
              setArchived.mutate({ projectId: project.id, archived: false });
            },
          },
        ]
      : [
          {
            id: 'archive',
            label: t('header.archiveProject'),
            icon: <ArchiveIcon size={14} />,
            onSelect: archive,
          },
        ];

  return (
    <PageHeader
      title={
        <>
          <Breadcrumb space={project.space} current={project.name} />
          <IconButton
            label={favoriteLabel}
            title={favoriteLabel}
            aria-pressed={project.isFavorite}
            size={28}
            onClick={() => {
              favorite.mutate(!project.isFavorite);
            }}
            icon={
              <StarIcon
                size={15}
                className={cn(project.isFavorite ? 'fill-favorite text-favorite' : 'text-icon')}
              />
            }
          />
        </>
      }
      actions={
        <>
          {project.members.length > 0 && (
            <AvatarStack
              // Who's online first, so they aren't hidden in "+N".
              users={project.members
                .map((m) => m.user)
                .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)))}
              label={t('header.members', { count: project.members.length })}
              onlineIds={online}
              onlineLabel={t('shell.online')}
            />
          )}
          <ShareButton />
          <span role="status" className="sr-only">
            {copied ? t('header.linkCopied') : ''}
          </span>
          <Menu
            label={t('header.projectOptions')}
            placement="bottom-end"
            items={[
              {
                id: 'favorite',
                label: favoriteLabel,
                icon: <StarIcon size={14} />,
                onSelect: () => {
                  favorite.mutate(!project.isFavorite);
                },
              },
              {
                id: 'copy',
                label: t('header.copyLink'),
                onSelect: () => void copy(),
              },
              { type: 'separator', id: 'sep' },
              {
                id: 'newSprint',
                label: t('sprint.new'),
                icon: <SprintIcon size={14} />,
                onSelect: () => {
                  setNewSprintOpen(true);
                },
              },
              ...(archiveItems.length ? [{ type: 'separator', id: 'sep-archive' } as const] : []),
              ...archiveItems,
            ]}
            trigger={(props) => (
              <IconButton
                {...props}
                label={t('header.projectOptions')}
                size={32}
                icon={<MoreIcon size={16} />}
              />
            )}
          />
          <NewSprintDialog
            project={project}
            open={newSprintOpen}
            onClose={() => {
              setNewSprintOpen(false);
            }}
          />
        </>
      }
      tabs={<ViewTabs basePath={`/p/${project.id}`} value={view} />}
      toolbar={<ViewToolbar project={project} empty={project.taskCount === 0} />}
    />
  );
}
