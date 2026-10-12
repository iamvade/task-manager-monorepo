import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/Skeleton';

const ROWS = [62, 48, 70, 40, 56];

/** People / My performance while loading: picker, 5 cards, 2 trends, helping and task rows. */
export function PersonSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6 px-6 pt-5 pb-10">
      <span className="sr-only">{t('reports.loading')}</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton shimmer width={36} height={36} className="rounded-full" />
          <span className="flex flex-col gap-1.5">
            <Skeleton shimmer width={140} height={14} />
            <Skeleton shimmer width={96} height={10} />
          </span>
        </div>
        <Skeleton shimmer height={40} className="rounded-[8px]" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2.5 rounded-[12px] border border-subtle px-4 py-3.5"
          >
            <Skeleton shimmer width={90} height={12} />
            <Skeleton shimmer width={72} height={26} />
            <Skeleton shimmer width={120} height={12} />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4"
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-[12px] border border-subtle px-5 py-4"
          >
            <Skeleton shimmer width={160} height={14} />
            <Skeleton shimmer height={96} className="rounded-[8px]" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 rounded-[12px] border border-subtle px-5 py-4"
      >
        <Skeleton shimmer width={140} height={14} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shimmer height={76} className="rounded-[10px]" />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-col">
        {ROWS.map((w, i) => (
          <div key={i} className="flex h-11 items-center gap-4 border-b border-subtle">
            <Skeleton shimmer width={10} height={10} className="rounded-full" />
            <Skeleton shimmer width={`${String(w)}%`} height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
