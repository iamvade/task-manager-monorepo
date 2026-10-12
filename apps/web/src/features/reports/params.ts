import {
  MAX_REPORT_DAYS,
  REPORT_PERIODS,
  dateSchema,
  daysBetween,
  type ReportPeriod,
  type SidebarSpace,
} from '@kite/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { ReportFilters } from '../../api/reports';

/** URL search params of the Reports pages (the drawer's `task` lives next to them). */
const KEYS = { period: 'period', from: 'from', to: 'to', space: 'space', project: 'project' };
export const AGING_PARAM = 'aging';

const isPeriod = (v: string | null): v is ReportPeriod =>
  REPORT_PERIODS.includes(v as ReportPeriod);
const isDate = (v: string | null): v is string => v !== null && dateSchema.safeParse(v).success;

/** A custom range the API accepts: from ≤ to, at most MAX_REPORT_DAYS days. */
export function isValidCustomRange(from: string, to: string): boolean {
  const days = daysBetween(from, to) + 1;
  return days >= 1 && days <= MAX_REPORT_DAYS;
}

/** Filters from the URL; anything invalid falls back to the default (last 4 weeks, everything). */
export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const rawPeriod = params.get(KEYS.period);
  const from = params.get(KEYS.from);
  const to = params.get(KEYS.to);
  let period: ReportPeriod = isPeriod(rawPeriod) ? rawPeriod : '4w';
  const custom =
    period === 'custom' && isDate(from) && isDate(to) && isValidCustomRange(from, to)
      ? { from, to }
      : null;
  if (period === 'custom' && !custom) period = '4w';
  const spaceId = params.get(KEYS.space) ?? undefined;
  const projectId = params.get(KEYS.project) ?? undefined;
  return {
    period,
    ...(custom ?? {}),
    ...(spaceId ? { spaceId } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

/** `params` with `filters` written in (defaults omitted); other params (e.g. `task`) kept. */
export function writeReportFilters(params: URLSearchParams, filters: ReportFilters) {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set(KEYS.period, filters.period === '4w' ? undefined : filters.period);
  set(KEYS.from, filters.period === 'custom' ? filters.from : undefined);
  set(KEYS.to, filters.period === 'custom' ? filters.to : undefined);
  set(KEYS.space, filters.spaceId);
  set(KEYS.project, filters.projectId);
  return next;
}

/**
 * Picking a space keeps the project only if it belongs to that space; picking a project also
 * selects its space (so the Space button shows where the project lives).
 */
export function scopeForSpace(
  spaces: readonly SidebarSpace[],
  current: ReportFilters,
  spaceId: string | undefined,
): Pick<ReportFilters, 'spaceId' | 'projectId'> {
  const space = spaces.find((s) => s.id === spaceId);
  const keep =
    spaceId === undefined ||
    (current.projectId !== undefined && space?.projects.some((p) => p.id === current.projectId));
  return { spaceId, projectId: keep ? current.projectId : undefined };
}

export function scopeForProject(
  spaces: readonly SidebarSpace[],
  projectId: string | undefined,
): Pick<ReportFilters, 'spaceId' | 'projectId'> {
  if (projectId === undefined) return { spaceId: undefined, projectId: undefined };
  const space = spaces.find((s) => s.projects.some((p) => p.id === projectId));
  return { spaceId: space?.id, projectId };
}

/** Search string that carries the filters to another Reports tab (drops the drawer + aging). */
export function filtersSearch(params: URLSearchParams): string {
  const next = writeReportFilters(new URLSearchParams(), parseReportFilters(params));
  const qs = next.toString();
  return qs ? `?${qs}` : '';
}

/** Reports filters in the URL, with a setter that merges a patch (history `replace`). */
export function useReportParams() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseReportFilters(params), [params]);
  const agingAll = params.get(AGING_PARAM) === 'all';

  const setFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      setParams(
        (prev) => {
          // An explicit `undefined` in the patch clears that param.
          return writeReportFilters(prev, { ...parseReportFilters(prev), ...patch });
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setAgingAll = useCallback(
    (all: boolean) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (all) next.set(AGING_PARAM, 'all');
          else next.delete(AGING_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { filters, setFilters, agingAll, setAgingAll };
}
