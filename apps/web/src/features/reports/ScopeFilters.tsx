import type { SidebarSpace } from '@kite/shared';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportFilters } from '../../api/reports';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { ChevronDownIcon } from '../../components/icons';
import { Picker } from '../../components/ui/Picker';
import { Popover, type TriggerProps } from '../../components/ui/Popover';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { scopeForProject, scopeForSpace } from './params';

interface ScopeFiltersProps {
  value: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  /** Empty state: only the Project filter. */
  projectOnly?: boolean;
  /**
   * Sprints: one project is always shown (no "All projects" row); `shownProjectId` is the one
   * the report picked while the URL names none.
   */
  requireProject?: boolean;
  shownProjectId?: string;
}

type ProjectItem = { project: SidebarSpace['projects'][number]; space: SidebarSpace } | null;

/** "Space: All ▾" and "Project: All ▾" outline buttons, each a searchable picker. */
export function ScopeFilters({
  value,
  onChange,
  projectOnly,
  requireProject,
  shownProjectId,
}: ScopeFiltersProps) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id).data;
  const spaces = useMemo(() => sidebar?.spaces ?? [], [sidebar]);
  const space = spaces.find((s) => s.id === value.spaceId);
  const projectId = value.projectId ?? (requireProject ? shownProjectId : undefined);
  const project = spaces.flatMap((s) => s.projects).find((p) => p.id === projectId);

  const projectItems = useMemo<ProjectItem[]>(
    () => [
      ...(requireProject ? [] : [null]),
      ...spaces
        .filter((s) => !value.spaceId || s.id === value.spaceId)
        .flatMap((s) => s.projects.map((p) => ({ project: p, space: s }))),
    ],
    [spaces, value.spaceId, requireProject],
  );

  return (
    <>
      {!projectOnly && (
        <Popover
          label={t('reports.filters.spaceLabel')}
          width={240}
          elevation="lg"
          trigger={(props, open) => (
            <FilterButton
              props={props}
              open={open}
              label={t('reports.filters.space')}
              value={space?.name ?? t('reports.filters.all')}
            />
          )}
        >
          {(close) => (
            <Picker<SidebarSpace | null>
              items={[null, ...spaces]}
              value={value.spaceId ?? ''}
              getKey={(s) => s?.id ?? ''}
              getLabel={(s) => s?.name ?? t('reports.filters.allSpaces')}
              label={t('reports.filters.spaceLabel')}
              search={{ placeholder: t('reports.filters.searchSpaces') }}
              onSelect={(s) => {
                onChange(scopeForSpace(spaces, value, s?.id));
              }}
              onClose={close}
              renderItem={(s) =>
                s ? (
                  <>
                    <SpaceBadge initial={s.initial} color={s.color} size={16} />
                    <span className="truncate">{s.name}</span>
                  </>
                ) : (
                  <span className="truncate">{t('reports.filters.allSpaces')}</span>
                )
              }
            />
          )}
        </Popover>
      )}
      <Popover
        label={t('reports.filters.projectLabel')}
        width={264}
        elevation="lg"
        trigger={(props, open) => (
          <FilterButton
            props={props}
            open={open}
            label={t('reports.filters.project')}
            value={project?.name ?? (requireProject ? '—' : t('reports.filters.all'))}
          />
        )}
      >
        {(close) => (
          <Picker<ProjectItem>
            items={projectItems}
            value={projectId ?? ''}
            getKey={(i) => i?.project.id ?? ''}
            getLabel={(i) => i?.project.name ?? t('reports.filters.allProjects')}
            label={t('reports.filters.projectLabel')}
            search={{ placeholder: t('reports.filters.searchProjects') }}
            groupBy={(i) => (value.spaceId ? undefined : i?.space.name)}
            onSelect={(i) => {
              onChange(
                i
                  ? scopeForProject(spaces, i.project.id)
                  : { projectId: undefined, spaceId: value.spaceId },
              );
            }}
            onClose={close}
            renderItem={(i) =>
              i ? (
                <>
                  <ProjectDot color={i.project.color} size={8} />
                  <span className="flex-1 truncate">{i.project.name}</span>
                  <span className="font-mono text-[12px] text-muted">{i.project.key}</span>
                </>
              ) : (
                <span className="truncate">{t('reports.filters.allProjects')}</span>
              )
            }
          />
        )}
      </Popover>
    </>
  );
}

/** Outline 32px filter button: muted label, value, 12px chevron. */
function FilterButton({
  props,
  open,
  label,
  value,
}: {
  props: TriggerProps;
  open: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-haspopup="listbox"
      aria-expanded={open}
      className="flex h-8 max-w-[240px] items-center gap-1.5 rounded-[8px] border border-control bg-control px-2.5 text-[13px] text-2 hover:bg-hover"
    >
      <span className="flex-none text-muted">{label}</span>
      <span className="truncate">{value}</span>
      <ChevronDownIcon size={12} className="flex-none text-icon" />
    </button>
  );
}
