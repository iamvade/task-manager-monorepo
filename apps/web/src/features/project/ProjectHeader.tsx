import { NOTIFICATION_LEVELS, type ProjectDetail } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useNotificationLevels, useSetNotificationLevel } from '../../api/notifications';
import { useSetArchived, useToggleFavorite } from '../../api/projects';
import { useCanManageCreated } from '../../lib/useCanManageCreated';
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
import { useWsPath } from '../../api/workspaces';

/** Project top bar: breadcrumb, favorite, members, Share, options; view tabs + toolbar. */
export function ProjectHeader({ project, view }: { project: ProjectDetail; view: View }) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const online = useOnlineIds();
  const favorite = useToggleFavorite(project);
  const { copied, copy } = useCopyLink();
  const [newSprintOpen, setNewSprintOpen] = useState(false);
  const favoriteLabel = project.isFavorite ? t('header.unfavorite') : t('header.favorite');
  const canArchive = useCanManageCreated(project.createdById);
  const setArchived = useSetArchived(project.workspaceId);
  const levels = useNotificationLevels(project.workspaceId);
  const setLevel = useSetNotificationLevel(project.workspaceId);
  const navigate = useNavigate();

  function archive() {
    const { id: projectId, name, spaceId } = project;
    // The error toast comes from the mutation cache.
    const failed = () => undefined;
    // Promises, not per-call callbacks: the header unmounts when the space list opens.
    setArchived
      .mutateAsync({ projectId, archived: true })
      .then(() => {
        void navigate(ws(`/s/${spaceId}/list`));
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

  const archiveItems: MenuItem[] = !canArchive
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
              { type: 'separator', id: 'sep-notify' },
              { type: 'heading', id: 'notify', label: t('notifyLevel.heading') },
              ...NOTIFICATION_LEVELS.map((level) => ({
                id: `notify-${level}`,
                label: t(`notifyLevel.${level}`),
                checked: (levels.data?.get(project.id) ?? 'all') === level,
                onSelect: () => {
                  setLevel.mutate({ projectId: project.id, level });
                },
              })),
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
      tabs={<ViewTabs basePath={ws(`/p/${project.id}`)} value={view} />}
      toolbar={<ViewToolbar project={project} empty={project.taskCount === 0} />}
    />
  );
}
