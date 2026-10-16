import {
  WORKLOAD_BUCKETS,
  awayUntil,
  type UserRef,
  type WorkloadPerson,
  type WorkloadTask,
  type WorkspaceMember,
} from '@kite/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { useShortNames } from '../../../lib/useShortNames';
import { StackedBar } from '../charts/StackedBar';
import { BUCKET_FILL, OUTSIDE_SWATCH, bucketSwatch } from './buckets';
import { CapacityPill } from './CapacityPill';
import { workloadTicks } from './layout';
import { PersonTasks } from './PersonTasks';

const GRID = 'grid grid-cols-[24px_200px_88px_120px_minmax(0,1fr)_128px] gap-x-4 px-5';

interface WorkloadTableProps {
  /** Already sorted. */
  people: readonly WorkloadPerson[];
  scale: number;
  members: readonly WorkspaceMember[];
  onReassign: (task: WorkloadTask, users: UserRef[]) => void;
  onAssignWork: (person: WorkloadPerson) => void;
}

/**
 * Team workload table (ReportsWorkload.dc.html): a legend + scale header, then one row per
 * person with open tasks, points, a stacked bar by due bucket on the shared scale with their
 * capacity marker, and the Heavy / Balanced / Light pill; rows expand to the person's tasks.
 */
export function WorkloadTable({
  people,
  scale,
  members,
  onReassign,
  onAssignWork,
}: WorkloadTableProps) {
  const { t } = useTranslation();
  const k = 'reports.workload';
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const ticks = workloadTicks(scale);
  const pct = (v: number) => `${((v / scale) * 100).toFixed(2)}%`;
  const users = useMemo(() => people.map((person) => person.user), [people]);
  const shortNameOf = useShortNames(users);

  return (
    <section
      aria-label={t(`${k}.title`)}
      className="overflow-hidden rounded-[12px] border border-default bg-panel"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div
            className={`${GRID} items-end border-b border-table-row bg-subtle pt-3.5 pb-2.5 text-[12px] font-medium text-muted`}
          >
            <span />
            <span>{t(`${k}.cols.person`)}</span>
            <span className="text-right">{t(`${k}.cols.tasks`)}</span>
            <span className="text-right">{t(`${k}.cols.size`)}</span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3.5 font-normal text-2">
                {WORKLOAD_BUCKETS.map((b) => (
                  <span key={b} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="box-border size-2.5 rounded-[3px]"
                      style={bucketSwatch(b)}
                    />
                    {t(`${k}.buckets.${b}`)}
                  </span>
                ))}
                <span className="flex items-center gap-1.5" title={t(`${k}.outsideHint`)}>
                  <span
                    aria-hidden="true"
                    className="box-border size-2.5 rounded-[3px]"
                    style={OUTSIDE_SWATCH}
                  />
                  {t(`${k}.outside`)}
                </span>
              </div>
              <div aria-hidden="true" className="relative h-3.5">
                {ticks.map((v) => (
                  <span
                    key={v}
                    className="absolute top-0 text-[11px] leading-[14px] font-normal tabular-nums"
                    style={{
                      left: pct(v),
                      transform:
                        v === 0 ? 'none' : v === scale ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
            <span>{t(`${k}.cols.capacity`)}</span>
          </div>
          {people.map((person) => (
            <WorkloadRow
              key={person.user.id}
              person={person}
              name={shortNameOf(person.user)}
              scale={scale}
              open={open.has(person.user.id)}
              onToggle={() => {
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(person.user.id)) next.delete(person.user.id);
                  else next.add(person.user.id);
                  return next;
                });
              }}
            >
              <PersonTasks
                person={person}
                members={members}
                onReassign={onReassign}
                onAssignWork={() => {
                  onAssignWork(person);
                }}
              />
            </WorkloadRow>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkloadRow({
  person,
  name,
  scale,
  open,
  onToggle,
  children,
}: {
  person: WorkloadPerson;
  /** Short name, distinct within the table. */
  name: string;
  scale: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { today } = useDates();
  const k = 'reports.workload';
  const pts = t(`${k}.pts`, { count: person.points });
  const overdue = person.buckets.overdue.points;
  // Counted points by due bucket, then the rest (later / undated work outside a current sprint)
  // as one outlined segment: only the counted part is compared with the capacity marker.
  const counted = (b: (typeof WORKLOAD_BUCKETS)[number]) =>
    person.tasks.filter((x) => x.bucket === b && x.counted);
  const outside = person.tasks.filter((x) => !x.counted);
  const sum = (list: readonly WorkloadTask[]) => list.reduce((a, x) => a + x.points, 0);
  const segments = [
    ...WORKLOAD_BUCKETS.map((b) => ({
      key: b,
      value: sum(counted(b)),
      fill: BUCKET_FILL[b],
      title: t(`${k}.segment`, {
        bucket: t(`${k}.buckets.${b}`),
        points: t(`${k}.pts`, { count: sum(counted(b)) }),
        tasks: t(`${k}.tasks`, { count: counted(b).length }),
      }),
    })),
    {
      key: 'outside',
      value: sum(outside),
      fill: 'outline',
      title: t(`${k}.segment`, {
        bucket: t(`${k}.outside`),
        points: t(`${k}.pts`, { count: sum(outside) }),
        tasks: t(`${k}.tasks`, { count: outside.length }),
      }),
    },
  ];

  return (
    <div className="flex flex-col border-b border-table-row last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t(`${k}.rowLabel`, {
          name,
          tasks: t(`${k}.tasks`, { count: person.openTasks }),
          points: pts,
          load: t(`${k}.load.${person.load}`),
        })}
        onClick={onToggle}
        className={cn(
          `${GRID} min-h-14 w-full items-center border-0 text-left text-default hover:bg-subtle focus-visible:-outline-offset-2`,
          open ? 'bg-subtle' : 'bg-panel',
        )}
      >
        <ChevronRightIcon
          size={14}
          className={cn('text-icon transition-transform', open && 'rotate-90')}
        />
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar user={person.user} size={28} textSize={11} title={null} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium" title={person.user.name}>
              {name}
            </span>
            {person.title && (
              <span className="truncate text-[12px] text-muted">{person.title}</span>
            )}
          </span>
        </span>
        <span className="text-right text-[14px] tabular-nums">{person.openTasks}</span>
        <span className="flex flex-col items-end">
          <span className="text-[14px] font-semibold tabular-nums">{pts}</span>
          {overdue > 0 && (
            <span className="text-[12px] leading-4 font-medium whitespace-nowrap text-due-overdue">
              {t(`${k}.overduePts`, { count: overdue })}
            </span>
          )}
        </span>
        <StackedBar
          segments={segments}
          scale={scale}
          marker={person.capacity}
          markerTitle={t(`${k}.capTitle`, { count: person.capacity })}
        />
        <span className="flex">
          <CapacityPill
            load={person.load}
            capacity={person.capacity}
            awayUntil={awayUntil(person, today)}
          />
        </span>
      </button>
      {open && children}
    </div>
  );
}
