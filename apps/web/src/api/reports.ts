import { overviewReportSchema, type ReportPeriod } from '@kite/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch, toQuery } from './client';
import { queryKeys } from './queryKeys';

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

type ReportName = 'overview' | 'sprints' | 'workload' | 'people/me';

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
  query: ReportFilters,
): string {
  return `/api/v1/workspaces/${workspaceId}/reports/${report}.csv${reportQueryString(query)}`;
}

export function useOverviewReport(workspaceId: string | undefined, query: OverviewQuery) {
  return useQuery({
    queryKey: queryKeys.report(workspaceId ?? '', 'overview', query),
    queryFn: () =>
      apiFetch(
        `/workspaces/${workspaceId ?? ''}/reports/overview${reportQueryString(query)}`,
        overviewReportSchema,
      ),
    enabled: Boolean(workspaceId),
    // Changing a filter keeps the current numbers on screen instead of the skeleton.
    placeholderData: keepPreviousData,
    refetchInterval: REPORTS_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}
