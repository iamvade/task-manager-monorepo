import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useToggleFavorite } from '../../api/projects';
import { MoreIcon, StarIcon } from '../../components/icons';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { cn } from '../../lib/cn';
import { useCopyLink } from '../../lib/useCopyLink';
import { Breadcrumb } from '../views/Breadcrumb';
import { PageHeader } from '../views/PageHeader';
import { ShareButton } from '../views/ShareButton';
import { ViewTabs } from '../views/ViewTabs';
import type { View } from '../views/views';
import { ViewToolbar } from '../views/ViewToolbar';

/** Project top bar: breadcrumb, favorite, members, Share, options; view tabs + toolbar. */
export function ProjectHeader({ project, view }: { project: ProjectDetail; view: View }) {
  const { t } = useTranslation();
  const favorite = useToggleFavorite(project);
  const { copied, copy } = useCopyLink();
  const favoriteLabel = project.isFavorite ? t('header.unfavorite') : t('header.favorite');

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
              users={project.members.map((m) => m.user)}
              label={t('header.members', { count: project.members.length })}
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
        </>
      }
      tabs={<ViewTabs basePath={`/p/${project.id}`} value={view} />}
      toolbar={<ViewToolbar project={project} empty={project.taskCount === 0} />}
    />
  );
}
