import { canManageCreated, type ArchivedProject, type WorkspaceRole } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useArchivedProjects, useSetArchived } from '../../api/projects';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { Skeleton } from '../../components/ui/Skeleton';
import { todayFor } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { SettingsSection } from './SettingsRow';

interface ArchivedProjectsSectionProps {
  workspaceId: string;
  /** Admins and owners restore; members only see the list. */
  role: WorkspaceRole;
}

/** Settings → Archived (not designed): archived projects, most recent first, with Restore. */
export function ArchivedProjectsSection({ workspaceId, role }: ArchivedProjectsSectionProps) {
  const { t } = useTranslation();
  const archived = useArchivedProjects(workspaceId);
  const setArchived = useSetArchived(workspaceId);
  const isAdmin = role !== 'member';
  const { me } = useAuth();
  const meId = me?.user.id ?? '';

  function restore(project: ArchivedProject) {
    setArchived.mutate(
      { projectId: project.id, archived: false },
      {
        onSuccess: () => {
          toast({ message: t('header.projectRestored', { name: project.name }) });
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!isAdmin && (
        <p className="m-0 rounded-[8px] bg-subtle px-3 py-2.5 text-[13px] text-3">
          {t('settings.archived.adminsOnly')}
        </p>
      )}
      <SettingsSection
        title={t('settings.archived.title')}
        description={t('settings.archived.hint')}
      >
        {archived.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 border-t border-subtle py-3 text-[13px] text-muted"
          >
            {t('settings.archived.loadError')}
            <Button size="sm" onClick={() => void archived.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !archived.data ? (
          <div className="flex flex-col gap-3 border-t border-subtle py-3" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} height={28} />
            ))}
          </div>
        ) : archived.data.length === 0 ? (
          <p className="m-0 border-t border-subtle py-3 text-[13px] text-muted">
            {t('settings.archived.empty')}
          </p>
        ) : (
          <ul className="m-0 list-none pl-0">
            {archived.data.map((project) => (
              <ArchivedRow
                key={project.id}
                project={project}
                canRestore={canManageCreated(role, project.createdById, meId)}
                restoring={setArchived.isPending && setArchived.variables.projectId === project.id}
                onRestore={() => {
                  restore(project);
                }}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function ArchivedRow({
  project,
  canRestore,
  restoring,
  onRestore,
}: {
  project: ArchivedProject;
  canRestore: boolean;
  restoring: boolean;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { formatDate } = useDates();
  const archivedOn = formatDate(todayFor(me?.preferences.timezone, new Date(project.archivedAt)));

  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-subtle py-2">
      <ProjectDot color={project.color} size={8} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            to={`/p/${project.id}/list`}
            className="truncate text-[13px] font-medium text-default no-underline hover:underline"
          >
            {project.name}
          </Link>
          <span className="font-mono text-[12px] text-muted">{project.key}</span>
        </span>
        <span className="truncate text-[12px] text-muted">
          {project.space.name} · {t('settings.archived.archivedOn', { date: archivedOn })}
        </span>
      </div>
      {canRestore && (
        <Button size="sm" disabled={restoring} onClick={onRestore}>
          {t('settings.archived.restore')}
        </Button>
      )}
    </li>
  );
}
