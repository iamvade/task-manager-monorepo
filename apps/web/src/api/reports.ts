import {
  overviewReportSchema,
  personReportSchema,
  sprintsReportSchema,
  taskListItemSchema,
  workloadReportSchema,
  type ReportPeriod,
  type UserRef,
  type WorkloadReport,
  type WorkspaceMember,
} from '@kite/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reassignInWorkload } from './workloadCache';
import { apiFetch, apiSend, toQuery } from './client';
import { queryKeys } from './queryKeys';
import { TASK_MUTATION, patchTask, restoreTask, settle, type TaskSnapshot } from './taskCache';

/** Reports refetch on this interval and on window focus (the server caches them as long). */
export const REPORTS_REFETCH_MS = 5 * 60_000;

/** Period + scope filters shared by the period reports (the URL of the Reports pages). */
export interface ReportFilters {
  period: ReportPeriod;
  from?: string;
  to?: string;
  spaceId?: string;
  projectId?: string;
}

export interface OverviewQuery extends ReportFilters {
  /** "View all": every open task in the Aging table. */
  agingLimit?: 'all';
}

export interface SprintsQuery {
  /** Omitted: the API picks the first project in scope that has sprints. */
  projectId?: string;
  spaceId?: string;
  sprintId?: string;
}

export interface WorkloadQuery {
  spaceId?: string;
  projectId?: string;
}

/** `people/me` or `people/<userId>` for the People / My performance report. */
type ReportName = 'overview' | 'sprints' | 'workload' | `people/${string}`;

/** Query string of a report request; custom dates only for the custom period. */
export function reportQueryString(query: OverviewQuery | ReportFilters): string {
  const { period, from, to, ...rest } = query;
  return toQuery({
    period: period === '4w' ? undefined : period,
    ...(period === 'custom' ? { from, to } : {}),
    ...rest,
  });
}

/** `GET …/reports/{report}.csv` with the same filters (a plain download link). */
export function reportCsvUrl(
  workspaceId: string,
  report: ReportName,
  query: ReportFilters | SprintsQuery | WorkloadQuery,
): string {
  const qs = 'period' in query ? reportQueryString(query) : toQuery({ ...query });
  return `/api/v1/workspaces/${workspaceId}/reports/${report}.csv${qs}`;
}

/** Shared by every report query: keep numbers on screen while filters change, refresh often. */
const reportQueryOptions = {
  // Changing a filter keeps the current numbers on screen instead of the skeleton.
  placeholderData: keepPreviousData,
  refetchInterval: REPORTS_REFETCH_MS,
  refetchOnWindowFocus: true,
} as const;

export function useOverviewReport(workspaceId: string | undefined, query: OverviewQuery) {
  return useQuery({
    queryKey: queryKeys.report(workspaceId ?? '', 'overview', query),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/reports/overview${reportQueryString(query)}`,
        overviewReportSchema,
      ),
    enabled: Boolean(workspaceId),
    ...reportQueryOptions,
  });
}

export function useSprintsReport(workspaceId: string | undefined, query: SprintsQuery) {
  return useQuery({
    queryKey: queryKeys.report(workspaceId ?? '', 'sprints', query),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/reports/sprints${toQuery({ ...query })}`,
        sprintsReportSchema,
      ),
    enabled: Boolean(workspaceId),
    ...reportQueryOptions,
  });
}

export function useWorkloadReport(workspaceId: string | undefined, query: WorkloadQuery) {
  return useQuery({
    queryKey: queryKeys.report(workspaceId ?? '', 'workload', query),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/reports/workload${toQuery({ ...query })}`,
        workloadReportSchema,
      ),
    enabled: Boolean(workspaceId),
    ...reportQueryOptions,
  });
}

/** People (`personId` = a member's id) or My performance (`'me'`): period filters only. */
export function usePersonReport(
  workspaceId: string | undefined,
  personId: string,
  filters: ReportFilters,
) {
  const query = { period: filters.period, from: filters.from, to: filters.to };
  return useQuery({
    queryKey: queryKeys.report(workspaceId ?? '', `people/${personId}`, query),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/reports/people/${personId}${reportQueryString(query)}`,
        personReportSchema,
      ),
    enabled: Boolean(workspaceId),
    ...reportQueryOptions,
  });
}

export interface ReassignVars {
  taskId: string;
  /** The task's full new assignee set (the picker toggles one person at a time). */
  users: UserRef[];
}

type WorkloadSnapshot = [readonly unknown[], WorkloadReport | undefined][];

/**
 * Workload "reassign": `PUT /tasks/:id/assignees`, moving the task between people's rows (and
 * their bars) at once and patching any open list or drawer; errors roll everything back. The
 * reports refetch when the last task write settles.
 */
export function useReassignWorkloadTask(workspaceId: string, members: readonly WorkspaceMember[]) {
  const queryClient = useQueryClient();
  const workloadKey = [...queryKeys.reportsOf(workspaceId), 'workload'];
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ taskId, users }: ReassignVars) =>
      apiSend(`/tasks/${taskId}/assignees`, taskListItemSchema, 'PUT', {
        userIds: users.map((u) => u.id),
      }),
    onMutate: async ({ taskId, users }) => {
      await queryClient.cancelQueries({ queryKey: workloadKey });
      const reports: WorkloadSnapshot = queryClient.getQueriesData<WorkloadReport>({
        queryKey: workloadKey,
      });
      for (const [key, report] of reports) {
        if (report) {
          queryClient.setQueryData(key, reassignInWorkload(report, taskId, users, members));
        }
      }
      const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));
      const task: TaskSnapshot = await patchTask(queryClient, taskId, (t) => ({
        ...t,
        assignees: sorted,
      }));
      return { reports, task };
    },
    onError: (_err, _vars, context) => {
      for (const [key, report] of context?.reports ?? []) queryClient.setQueryData(key, report);
      restoreTask(queryClient, context?.task);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}
