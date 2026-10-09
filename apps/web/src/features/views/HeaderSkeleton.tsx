import { Skeleton } from '../../components/ui/Skeleton';

/** Top bar + list rows while the project loads. */
export function HeaderSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <div className="flex flex-col gap-4 border-b border-default px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton width={18} height={18} />
          <Skeleton width={180} height={12} />
        </div>
        <div className="flex gap-4">
          <Skeleton width={64} height={12} />
          <Skeleton width={64} height={12} />
          <Skeleton width={72} height={12} />
        </div>
      </div>
      <div className="flex flex-col px-6 pt-6">
        {[72, 56, 64, 48, 60].map((w, i) => (
          <div key={i} className="flex h-11 items-center gap-4 border-b border-subtle px-2">
            <Skeleton width={16} height={16} />
            <Skeleton width={`${w}%`} height={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
