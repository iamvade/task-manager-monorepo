import { dateSchema, type StandupGroup } from '@kite/shared';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useStandupDay, useStandupSuggestions } from '../../../api/standups';
import { useAuth } from '../../../auth/useAuth';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { DEFAULT_TIMEZONE } from '../../../lib/dates';
import { formatClock } from '../../../lib/relativeTime';
import { useDates } from '../../../lib/useDates';
import { useIsNarrow } from '../../../lib/useMediaQuery';
import { BlockersSection } from './BlockersSection';
import { DayContext, type DayView } from './DayContext';
import { DayHeader } from './DayHeader';
import { EntryCard } from './EntryCard';
import { dayHref } from './links';
import { MeetingSection } from './MeetingSection';
import { MyPlaceholderCard, OutCard } from './PersonCards';
import { loadWriteModal } from '../write/loadWriteModal';
import { PostedStrip } from './PostedStrip';

const StandupWriteModal = lazy(() =>
  loadWriteModal().then((m) => ({ default: m.StandupWriteModal })),
);

/**
 * `/standup/:groupId/:date?` (Standup.dc.html): who has posted, open blockers, the updates.
 * Members only (the API answers 403 to others); past days are read-only except replies.
 */
export function StandupDayView({
  group,
  groups,
  date: dateParam,
}: {
  group: StandupGroup;
  groups: readonly StandupGroup[];
  date: string | undefined;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { formatDay } = useDates();
  const narrow = useIsNarrow();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const valid =
    dateParam === undefined ||
    (dateSchema.safeParse(dateParam).success && dateParam <= group.today);
  const day = useStandupDay(group.id, dateParam ?? 'today', { enabled: group.isMember && valid });
  const data = day.data;
  const zone = me?.preferences.timezone ?? DEFAULT_TIMEZONE;
  const myPosted = data?.myEntry?.status === 'posted';
  const canWrite = Boolean(data?.editable);
  const suggestions = useStandupSuggestions(
    group.id,
    data?.date ?? group.today,
    canWrite && !myPosted,
  );

  // The write modal opens instantly once the browser has had a quiet moment.
  useEffect(() => {
    const preload = () => void loadWriteModal();
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => {
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(preload, 1500);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  // "#entry-…" (Copy link) scrolls to that update once it has rendered.
  useEffect(() => {
    if (!data || !hash.startsWith('#entry-')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [data, hash]);

  const view = useMemo((): DayView | null => {
    if (!data || !me) return null;
    const clock = (iso: string) => formatClock(new Date(iso), zone);
    return {
      day: data,
      me: me.user,
      live: data.group.isMember && data.date === data.today && !data.group.archivedAt,
      clock,
      postBy: clock(data.postByAt),
    };
  }, [data, me, zone]);

  if (!valid) return <Navigate to={`/standup/${group.id}`} replace />;
  // No standup today (weekend, holiday): open the latest standup day.
  if (data && dateParam === undefined && !data.isStandupDay && data.prevDate) {
    return <Navigate to={dayHref(group.id, data.prevDate)} replace />;
  }

  const writing = params.get('write') === '1';
  const closeWrite = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('write');
        return next;
      },
      { replace: true },
    );
  };

  const header = (
    <DayHeader
      group={group}
      groups={groups}
      day={data ?? null}
      canWrite={canWrite}
      posted={myPosted}
    />
  );

  if (!group.isMember) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <EmptyState title={group.name} body={t('standup.day.membersOnly')} />
      </div>
    );
  }
  if (day.isError) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <ErrorState error={day.error} />
      </div>
    );
  }
  if (!view || !data) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <DaySkeleton />
      </div>
    );
  }

  const placeholder = canWrite && !myPosted;
  const hint =
    data.myEntry?.status === 'draft'
      ? t('standup.day.draftSaved')
      : (suggestions.data?.yesterday.length ?? 0) > 0
        ? t('standup.day.youHint')
        : null;
  const out = data.members.filter((m) => m.state === 'out');
  const isToday = data.date === data.today;
  const noStandupToday = !data.group.meetsToday && data.nextDate === null && data.upcomingDate;

  return (
    <DayContext.Provider value={view}>
      <div className="flex min-h-full flex-col">
        {header}
        <div className="box-border flex w-full max-w-[1120px] flex-col gap-6 px-6 pt-5 pb-12 max-sm:gap-5 max-sm:px-4 max-sm:pt-4">
          {noStandupToday && data.upcomingDate && (
            <p className="m-0 text-[13px] text-muted">
              {t('standup.day.noStandupToday', {
                date: formatDay('weekdayShortDate', data.upcomingDate),
              })}
            </p>
          )}
          <PostedStrip yourTurn={placeholder} />
          <MeetingSection />
          {/* On a phone blockers always come first (one column, they're what needs help). */}
          {(data.group.showBlockersFirst || narrow) && <BlockersSection />}
          <section aria-labelledby="standup-updates" className="flex flex-col gap-3">
            <h2 id="standup-updates" className="m-0 text-[15px] font-semibold">
              {isToday ? t('standup.day.updates') : t('standup.day.updatesOn')}
            </h2>
            {!placeholder && data.entries.length === 0 && out.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t('standup.day.noUpdates')}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))] items-start gap-4">
                {placeholder && <MyPlaceholderCard hint={hint} />}
                {data.entries.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
                {out.map((m) => (
                  <OutCard key={m.user.id} member={m} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {writing && canWrite && (
        <Suspense fallback={null}>
          <StandupWriteModal day={data} onClose={closeWrite} />
        </Suspense>
      )}
    </DayContext.Provider>
  );
}

function DaySkeleton() {
  return (
    <div aria-busy="true" className="flex max-w-[1120px] flex-col gap-6 px-6 pt-5 max-sm:px-4">
      <Skeleton height={96} />
      <Skeleton width={160} height={16} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))] gap-4">
        <Skeleton height={220} />
        <Skeleton height={220} />
      </div>
    </div>
  );
}

/** `?write=1` over the empty state (StandupEmpty.dc.html "Write the first update"). */
export function WriteOverEmpty({ group }: { group: StandupGroup }) {
  const [params, setParams] = useSearchParams();
  const writing = params.get('write') === '1' && group.isMember;
  const day = useStandupDay(group.id, 'today', { enabled: writing });
  if (!writing || !day.data?.editable) return null;
  return (
    <Suspense fallback={null}>
      <StandupWriteModal
        day={day.data}
        onClose={() => {
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('write');
              return next;
            },
            { replace: true },
          );
        }}
      />
    </Suspense>
  );
}
