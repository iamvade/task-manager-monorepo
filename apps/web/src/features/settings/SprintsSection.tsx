import { canManageSprint, type SprintWithUsage, type WorkspaceRole } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { useDeleteSprint, useSprints } from '../../api/sprints';
import { useSidebar } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { MoreIcon, PlusIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { Modal } from '../../components/ui/Modal';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { Skeleton } from '../../components/ui/Skeleton';
import { reportError } from '../../lib/mutationErrors';
import { sprintLabel } from '../../lib/sprint';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { CurrentPill } from '../reports/sprints/SprintSelect';
import { SprintForm } from '../project/SprintForm';
import { SettingsSection } from './SettingsRow';

interface SprintsSectionProps {
  workspaceId: string;
  role: WorkspaceRole;
}

/** Past sprints shown before "Show all". */
const PAST_SHOWN = 6;

/**
 * Settings → Sprints (not designed): the workspace's sprints, current and upcoming first, then
 * past ones newest first, each with its projects and task count. Any member creates one; admins,
 * owners and its creator edit it (name, dates, projects) or delete it while no task was in it.
 */
export function SprintsSection({ workspaceId, role }: SprintsSectionProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { today } = useDates();
  const sprints = useSprints(workspaceId);
  const remove = useDeleteSprint(workspaceId);
  const headingId = useId();
  const [editing, setEditing] = useState<SprintWithUsage | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SprintWithUsage | null>(null);
  const [allPast, setAllPast] = useState(false);

  const all = sprints.data ?? [];
  const current = all.filter((s) => s.startDate <= today && today <= s.endDate);
  const upcoming = all.filter((s) => s.startDate > today);
  const past = all.filter((s) => s.endDate < today).reverse();
  const groups = [
    { key: 'current', rows: current },
    { key: 'upcoming', rows: upcoming },
    { key: 'past', rows: allPast ? past : past.slice(0, PAST_SHOWN) },
  ] as const;
  const canManage = (s: SprintWithUsage) => canManageSprint(role, s.createdBy, me?.user.id ?? '');

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title={t('settings.sprints.title')} description={t('settings.sprints.hint')}>
        <div className="flex justify-end pb-3">
          <Button
            size="md"
            variant="primary"
            icon={<PlusIcon size={14} />}
            disabled={!sprints.data}
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('sprint.new')}
          </Button>
        </div>
        {sprints.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 border-t border-subtle py-3 text-[13px] text-muted"
          >
            {t('settings.sprints.loadError')}
            <Button size="sm" onClick={() => void sprints.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !sprints.data ? (
          <div className="flex flex-col gap-3 border-t border-subtle py-3" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={28} />
            ))}
          </div>
        ) : all.length === 0 ? (
          <p className="m-0 border-t border-subtle py-3 text-[13px] text-muted">
            {t('settings.sprints.empty')}
          </p>
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key} aria-label={t(`settings.sprints.groups.${g.key}`)}>
                <h3 className="m-0 border-t border-subtle pt-3 pb-1 text-[12px] font-semibold text-muted">
                  {t(`settings.sprints.groups.${g.key}`)}
                </h3>
                <ul className="m-0 list-none pl-0">
                  {g.rows.map((sprint) => (
                    <SprintRow
                      key={sprint.id}
                      sprint={sprint}
                      workspaceId={workspaceId}
                      current={g.key === 'current'}
                      canManage={canManage(sprint)}
                      onEdit={() => {
                        setEditing(sprint);
                      }}
                      onDelete={() => {
                        setDeleting(sprint);
                      }}
                    />
                  ))}
                </ul>
                {g.key === 'past' && !allPast && past.length > PAST_SHOWN && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAllPast(true);
                    }}
                  >
                    {t('settings.sprints.showAllPast', { count: past.length })}
                  </Button>
                )}
              </section>
            ))
        )}
      </SettingsSection>
      <Modal
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        labelledBy={headingId}
        width={400}
      >
        {editing !== null && (
          <div className="p-2">
            <SprintForm
              workspaceId={workspaceId}
              sprints={all}
              sprint={editing === 'new' ? undefined : editing}
              headingId={headingId}
              onDone={(saved) => {
                setEditing(null);
                toast({
                  message: t(
                    editing === 'new' ? 'settings.sprints.created' : 'settings.sprints.saved',
                    {
                      name: sprintLabel(t, saved),
                    },
                  ),
                });
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title={t('settings.sprints.deleteTitle', {
          name: deleting ? sprintLabel(t, deleting) : '',
        })}
        body={t('settings.sprints.deleteBody')}
        confirmLabel={t('settings.sprints.delete')}
        tone="danger"
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          const name = sprintLabel(t, deleting);
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast({ message: t('settings.sprints.deleted', { name }) });
            },
            onError: (err) => {
              setDeleting(null);
              reportError(
                err,
                err instanceof ApiError && err.code === 'SPRINT_IN_USE'
                  ? t('settings.sprints.inUse')
                  : t('common.genericError'),
              );
            },
          });
        }}
      />
    </div>
  );
}

function SprintRow({
  sprint,
  workspaceId,
  current,
  canManage,
  onEdit,
  onDelete,
}: {
  sprint: SprintWithUsage;
  workspaceId: string;
  current: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { formatRange } = useDates();
  const projects = (useSidebar(workspaceId).data?.spaces ?? [])
    .flatMap((s) => s.projects)
    .filter((p) => sprint.projectIds.includes(p.id));
  const name = sprintLabel(t, sprint);

  return (
    <li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="truncate font-semibold">{name}</span>
          <span className="flex-none text-muted">
            {formatRange(sprint.startDate, sprint.endDate)}
          </span>
          {current && <CurrentPill />}
        </div>
        <ul
          aria-label={t('settings.sprints.projectsOf', { name })}
          className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 pl-0 text-[12px] text-2"
        >
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <ProjectDot color={p.color} />
              {p.name}
            </li>
          ))}
        </ul>
      </div>
      <span className="flex-none text-[12px] text-muted tabular-nums">
        {t('settings.sprints.tasks', { count: sprint.taskCount })}
      </span>
      {canManage && (
        <Menu
          label={t('settings.sprints.actions', { name })}
          placement="bottom-end"
          width={200}
          items={[
            { id: 'edit', label: t('sprint.edit'), onSelect: onEdit },
            { type: 'separator', id: 'sep' },
            {
              id: 'delete',
              label: t('settings.sprints.delete'),
              danger: true,
              disabled: sprint.taskCount > 0,
              onSelect: onDelete,
            },
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label={t('settings.sprints.actions', { name })}
              size={28}
              icon={<MoreIcon size={14} className="text-icon" />}
            />
          )}
        />
      )}
    </li>
  );
}
