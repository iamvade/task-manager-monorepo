import type { ProjectDetail } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useSetArchived } from '../../api/projects';
import { useCurrentWorkspace } from '../../api/workspaces';
import { ArchiveIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';

/**
 * Strip under the header of an archived project (old links, Settings → Archived; not designed):
 * what archiving hides, and Restore for admins and owners.
 */
export function ArchivedBanner({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const isAdmin = useCurrentWorkspace()?.role !== 'member';
  const setArchived = useSetArchived(project.workspaceId);

  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-subtle bg-subtle px-6 py-2 text-[13px] text-2">
      <ArchiveIcon size={16} className="flex-none text-icon" />
      <p className="m-0 min-w-0 flex-1">{t('header.archivedBanner')}</p>
      {isAdmin && (
        <Button
          size="sm"
          disabled={setArchived.isPending}
          onClick={() => {
            setArchived.mutate({ projectId: project.id, archived: false });
          }}
        >
          {t('header.restoreProject')}
        </Button>
      )}
    </div>
  );
}
