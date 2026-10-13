import { addDays } from '@kite/shared';
import { useMemo } from 'react';
import { useAuth } from '../../auth/useAuth';
import { todayFor } from '../../lib/dates';
import { toTaskQuery, type ListScope } from './taskQuery';
import { useViewParams } from './useViewParams';

/** List and Board show done tasks completed in the last 14 days unless `?done=all`. */
export const RECENT_DONE_DAYS = 14;

/**
 * The current URL filters as a List/Board query (memoized: it is part of the query key, and the
 * List, Board and filter strip share one cache entry).
 */
export function useTaskQuery(scope: ListScope) {
  const { me } = useAuth();
  const { filters, allDone } = useViewParams();
  const meId = me?.user.id ?? '';
  const today = todayFor(me?.preferences.timezone);
  const doneSince = allDone ? null : addDays(today, -(RECENT_DONE_DAYS - 1));
  return useMemo(
    () => toTaskQuery(filters, meId, scope, doneSince),
    [filters, meId, scope, doneSince],
  );
}
