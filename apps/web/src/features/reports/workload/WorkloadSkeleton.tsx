import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/Skeleton';

const ROWS = [78, 64, 58, 46, 40, 30, 22];
const GRID = 'grid grid-cols-[24px_200px_88px_120px_minmax(0,1fr)_128px] items-center gap-x-4 px-5';

/** Workload while loading, in the Overview skeleton's style (ReportsLoading.dc.html). */
export function WorkloadSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-5 px-6 pt-5 pb-10">
      <span className="sr-only">{t('reports.loading')}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <span className="text-[18px] leading-6 font-semibold text-faint">
          {t('reports.workload.title')}
        </span>
        <Skeleton shimmer width={560} height={12} className="max-w-[80%] rounded-[6px]" />
      </div>
      <section
        aria-hidden="true"
        className="flex flex-col overflow-hidden rounded-[12px] border border-subtle"
      >
        <div className="h-[58px] border-b border-[var(--surface-2)] bg-subtle" />
        {ROWS.map((w) => (
          <div key={w} className={`${GRID} h-14 border-b border-[var(--surface-2)]`}>
            <span />
            <span className="flex items-center gap-2.5">
              <Skeleton shimmer width={28} height={28} className="rounded-full" />
              <span className="flex flex-col gap-1.5">
                <Skeleton shimmer width={80} height={10} className="rounded-[5px]" />
                <Skeleton shimmer width={110} height={8} className="rounded-[4px]" />
              </span>
            </span>
            <Skeleton shimmer width={20} height={10} className="justify-self-end rounded-[5px]" />
            <Skeleton shimmer width={44} height={10} className="justify-self-end rounded-[5px]" />
            <Skeleton shimmer width={`${String(w)}%`} height={14} className="rounded-[4px]" />
            <Skeleton shimmer width={76} height={22} className="rounded-[11px]" />
          </div>
        ))}
      </section>
    </div>
  );
}
