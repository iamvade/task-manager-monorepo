import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/Skeleton';

const BARS = [40, 55, 48, 62, 58, 70, 60, 66, 74, 70, 78, 64];
const WAIT_ROWS = [30, 45, 90];
const TABLE_ROWS = [62, 48, 70, 40, 56];
const GRID = 'grid grid-cols-[minmax(0,1fr)_176px_160px_148px_120px] items-center gap-4';

/** Overview while loading (ReportsLoading.dc.html): faint real headings over shimmer blocks. */
export function OverviewSkeleton() {
  const { t } = useTranslation();
  const cards: [string, number][] = [
    [t('reports.cards.completed'), 140],
    [t('reports.cards.cycle'), 120],
    [t('reports.cards.onTime'), 100],
    [t('reports.cards.overdue'), 150],
  ];
  const heading = 'text-[15px] leading-5 font-semibold text-faint';
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6 px-6 pt-5 pb-10">
      <span className="sr-only">{t('reports.loading')}</span>
      <Skeleton shimmer width={420} height={12} className="mt-1 max-w-[70%]" />

      <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {cards.map(([label, width]) => (
          <div key={label} className="flex flex-col gap-3 rounded-[12px] border border-subtle p-4">
            <span className="flex items-center gap-2">
              <Skeleton shimmer width={14} height={14} className="rounded-full" />
              <span className="text-[13px] text-faint">{label}</span>
            </span>
            <Skeleton shimmer width={96} height={28} />
            <Skeleton shimmer width={width} height={12} />
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[12px] border border-subtle p-5">
          <div className="flex flex-col gap-1.5">
            <span className={heading}>{t('reports.throughput.title')}</span>
            <Skeleton shimmer width={240} height={10} className="rounded-[5px]" />
          </div>
          <div className="relative ml-8 h-[200px]">
            {[0, 50, 100, 150].map((top) => (
              <span key={top} className="absolute inset-x-0 h-px bg-surface-2" style={{ top }} />
            ))}
            <span className="absolute inset-x-0 bottom-0 h-px bg-[var(--border)]" />
            <div className="absolute inset-0 flex items-end gap-3 px-2">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="skeleton-shimmer flex-1 rounded-t-[4px]"
                  style={{ height: `${String(h)}%` }}
                />
              ))}
            </div>
          </div>
          <div className="ml-8 flex justify-between">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} shimmer width={36} height={8} className="rounded-[4px]" />
            ))}
          </div>
        </section>
        <section className="flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-[12px] border border-subtle p-5">
          <div className="flex flex-col gap-1.5">
            <span className={heading}>{t('reports.waits.title')}</span>
            <Skeleton shimmer width={180} height={10} className="rounded-[5px]" />
          </div>
          {WAIT_ROWS.map((w) => (
            <div key={w} className="flex flex-col gap-2">
              <div className="flex justify-between">
                <Skeleton shimmer width={90} height={10} className="rounded-[5px]" />
                <Skeleton shimmer width={48} height={10} className="rounded-[5px]" />
              </div>
              <Skeleton shimmer width={`${String(w)}%`} height={12} className="rounded-[4px]" />
            </div>
          ))}
          <Skeleton shimmer height={44} className="mt-auto rounded-[8px]" />
        </section>
      </div>

      <section
        aria-hidden="true"
        className="flex flex-col overflow-hidden rounded-[12px] border border-subtle"
      >
        <div className="flex flex-col gap-1.5 px-5 py-4">
          <span className={heading}>{t('reports.aging.title')}</span>
          <Skeleton shimmer width={300} height={10} className="max-w-[60%] rounded-[5px]" />
        </div>
        <div className="h-9 border-y border-[var(--surface-2)] bg-subtle" />
        {TABLE_ROWS.map((w) => (
          <div key={w} className={`${GRID} h-12 border-b border-[var(--surface-2)] px-5`}>
            <Skeleton shimmer width={`${String(w)}%`} height={10} className="rounded-[5px]" />
            <Skeleton shimmer width={110} height={10} className="rounded-[5px]" />
            <span className="flex items-center gap-2">
              <Skeleton shimmer width={24} height={24} className="rounded-full" />
              <Skeleton shimmer width={72} height={10} className="rounded-[5px]" />
            </span>
            <Skeleton shimmer width={88} height={10} className="rounded-[5px]" />
            <Skeleton shimmer width={56} height={10} className="justify-self-end rounded-[5px]" />
          </div>
        ))}
      </section>
    </div>
  );
}
