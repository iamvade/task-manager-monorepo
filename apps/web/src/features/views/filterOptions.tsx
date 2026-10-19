import {
  PRIORITIES,
  shortName,
  STATUS_CATEGORIES,
  UNASSIGNED,
  type ProjectDetail,
} from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useProjectSprints } from '../../api/sprints';
import { useTags } from '../../api/tags';
import { useSidebar, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { sprintLabel } from '../../lib/sprint';
import { Avatar } from '../../components/ui/Avatar';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { StatusDot } from '../../components/ui/StatusDot';
import { TagChip } from '../../components/ui/TagChip';
import { useDates } from '../../lib/useDates';
import { ASSIGNEE_ME } from './useViewParams';

export interface FilterOption {
  /** Value written to the URL. */
  key: string;
  /** Text for chips and search. */
  label: string;
  /** Text searched instead of the label (people: the full name, matched across scripts). */
  searchText?: string;
  /** Option content in the menu (defaults to the label). */
  content?: ReactNode;
}

export interface FilterOptions {
  status: FilterOption[];
  assignee: FilterOption[];
  /** Me + members (no "Unassigned": every task has a creator). */
  creator: FilterOption[];
  priority: FilterOption[];
  tag: FilterOption[];
  /** Sprints covering the project (space views: any project of the space). */
  sprint: FilterOption[];
}

const withIcon = (icon: ReactNode, label: string) => (
  <>
    {icon}
    <span className="truncate">{label}</span>
  </>
);

/**
 * Values the Filter menu offers and the chips name: a project's statuses (space list: the four
 * categories), Me / Unassigned / members, priorities, workspace tags, the sprints covering the
 * project (space views: any of the space's projects).
 */
export function useFilterOptions(
  project: ProjectDetail | null,
  workspaceId: string | undefined,
): FilterOptions {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const members = useWorkspaceMembers(workspaceId);
  const tags = useTags(workspaceId);
  const { spaceId } = useParams<{ spaceId?: string }>();
  const space = useSidebar(project ? undefined : workspaceId).data?.spaces.find(
    (s) => s.id === spaceId,
  );
  const sprints = useProjectSprints(
    workspaceId,
    project ? project.id : space?.projects.map((p) => p.id),
  );

  const status: FilterOption[] = project
    ? project.statuses.map((s) => {
        const label = s.name ?? t(`status.${s.category}`);
        return { key: s.id, label, content: withIcon(<StatusDot category={s.category} />, label) };
      })
    : STATUS_CATEGORIES.map((c) => {
        const label = t(`status.${c}`);
        return { key: c, label, content: withIcon(<StatusDot category={c} />, label) };
      });

  const people = (members.data ?? [])
    .filter((m) => m.user.id !== me?.user.id)
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  const assignee: FilterOption[] = [
    ...(me
      ? [
          {
            key: ASSIGNEE_ME,
            label: t('filters.me'),
            content: withIcon(<Avatar user={me.user} size={20} title={null} />, t('filters.me')),
          },
        ]
      : []),
    {
      key: UNASSIGNED,
      label: t('create.unassigned'),
      content: withIcon(
        <span
          aria-hidden="true"
          className="box-border size-5 flex-none rounded-full border border-dashed border-strong bg-surface-2"
        />,
        t('create.unassigned'),
      ),
    },
    ...people.map((m) => ({
      key: m.user.id,
      label: shortName(m.user.name),
      searchText: m.user.name,
      content: withIcon(<Avatar user={m.user} size={20} title={null} />, m.user.name),
    })),
  ];

  const priority: FilterOption[] = PRIORITIES.map((p) => ({
    key: p,
    label: t(`priority.${p}`),
    content: <PriorityFlag priority={p} showLabel />,
  }));

  const tag: FilterOption[] = (tags.data ?? []).map((x) => ({
    key: x.id,
    label: x.name,
    content: <TagChip name={x.name} color={x.color} />,
  }));

  const sprint: FilterOption[] = (sprints.data ?? []).map((s) => ({
    key: s.id,
    label: dates.formatRange(s.startDate, s.endDate),
    content: (
      <>
        <span className="truncate">{sprintLabel(t, s)}</span>
        <span className="ml-auto flex-none text-[12px] text-muted">
          {dates.formatRange(s.startDate, s.endDate)}
        </span>
      </>
    ),
  }));

  const creator = assignee.filter((o) => o.key !== UNASSIGNED);

  return { status, assignee, creator, priority, tag, sprint };
}
