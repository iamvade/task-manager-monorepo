import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/Skeleton';

const BARS = [70, 74, 78, 72, 82, 60];
const TABLE_ROWS = [62, 48, 70, 40];

/** Sprints while loading, in the Overview skeleton's style (ReportsLoading.dc.html). */
export function SprintsSkeleton() {
  const { t } = useTranslation();
  const k = 'reports.sprints';
  const cards = [
    t(`${k}.cards.committed`),
    t(`${k}.cards.completed`),
    t(`${k}.cards.added`),
    t(`${k}.cards.carried`),
  ];
  const heading = 'text-[15px] leading-5 font-semibold text-faint';
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6 px-6 pt-5 pb-10">
      <span className="sr-only">{t('reports.loading')}</span>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton shimmer width={280} height={18} />
          <Skeleton shimmer width={220} height={10} className="rounded-[5px]" />
        </div>
        <span className="flex-1" />
        <Skeleton shimmer width={240} height={6} className="rounded-[3px]" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {cards.map((label) => (
          <div
            key={label}
            className="flex flex-col gap-2.5 rounded-[12px] border border-subtle px-4 py-3.5"
          >
            <span className="flex items-center gap-2">
              <Skeleton shimmer width={10} height={10} className="rounded-[3px]" />
              <span className="text-[13px] text-faint">{label}</span>
            </span>
            <Skeleton shimmer width={64} height={26} />
            <Skeleton shimmer width={140} height={10} className="rounded-[5px]" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-4">
        {[t(`${k}.chart.title`), t(`${k}.burndown.title`)].map((title, panel) => (
          <section
            key={title}
            className="flex min-w-0 flex-[1_1_480px] flex-col gap-4 rounded-[12px] border border-subtle p-5"
          >
            <div className="flex flex-col gap-1.5">
              <span className={heading}>{title}</span>
              <Skeleton shimmer width={200} height={10} className="rounded-[5px]" />
            </div>
            <div className="relative ml-7 h-[200px]">
              {[0, 50, 100, 150].map((top) => (
                <span key={top} className="absolute inset-x-0 h-px bg-surface-2" style={{ top }} />
              ))}
              <span className="absolute inset-x-0 bottom-0 h-px bg-[var(--border)]" />
              {panel === 0 && (
                <div className="absolute inset-0 flex items-end justify-around px-2">
                  {BARS.map((h, i) => (
                    <span key={i} className="flex items-end gap-1">
                      <span
                        className="skeleton-shimmer w-[18px] rounded-t-[4px]"
                        style={{ height: `${String(h * 2)}px` }}
                      />
                      <span
                        className="skeleton-shimmer w-[18px] rounded-t-[4px]"
                        style={{ height: `${String(h * 1.6)}px` }}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <section
        aria-hidden="true"
        className="flex flex-col overflow-hidden rounded-[12px] border border-subtle"
      >
        <div className="flex flex-col gap-1.5 px-5 py-4">
          <span className={heading}>{t(`${k}.carried.title`)}</span>
          <Skeleton shimmer width={320} height={10} className="max-w-[60%] rounded-[5px]" />
        </div>
        <div className="h-9 border-y border-[var(--surface-2)] bg-subtle" />
        {TABLE_ROWS.map((w) => (
          <div
            key={w}
            className="grid h-12 grid-cols-[minmax(0,1fr)_176px_160px_148px_216px] items-center gap-4 border-b border-[var(--surface-2)] px-5"
          >
            <Skeleton shimmer width={`${String(w)}%`} height={10} className="rounded-[5px]" />
            <Skeleton shimmer width={110} height={10} className="rounded-[5px]" />
            <span className="flex items-center gap-2">
              <Skeleton shimmer width={24} height={24} className="rounded-full" />
              <Skeleton shimmer width={72} height={10} className="rounded-[5px]" />
            </span>
            <Skeleton shimmer width={88} height={10} className="rounded-[5px]" />
            <Skeleton shimmer width={96} height={10} className="justify-self-end rounded-[5px]" />
          </div>
        ))}
      </section>
    </div>
  );
}
