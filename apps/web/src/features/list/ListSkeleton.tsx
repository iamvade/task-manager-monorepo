import { Skeleton } from '../../components/ui/Skeleton';

/** Table rows while the tasks load. */
export function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col px-6 pt-6">
      {[72, 56, 64, 48, 60].map((w, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b border-subtle px-2">
          <Skeleton width={16} height={16} />
          <Skeleton width={`${String(w)}%`} height={10} />
        </div>
      ))}
    </div>
  );
}
