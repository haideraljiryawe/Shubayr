const shimmer = "animate-pulse rounded-md bg-card";

/**
 * Fallbacks for the sections that stream in after the product itself.
 *
 * There is deliberately no route-level `loading.tsx`: it starts the response
 * early, which flushes a 200 before the page can call notFound(), turning a
 * missing product into a soft 404. Keeping the product fetch blocking preserves
 * the real 404 status, and only the supporting sections stream.
 */
export function ReviewsSkeleton() {
  return (
    <section className="mt-12">
      <div className={`${shimmer} h-6 w-32`} />
      <div className={`${shimmer} mt-4 h-40 w-full rounded-lg`} />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${shimmer} h-24 w-full rounded-lg`} />
        ))}
      </div>
    </section>
  );
}

export function RelatedSkeleton() {
  return (
    <section className="mt-12">
      <div className={`${shimmer} h-6 w-40`} />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border">
            <div className={`${shimmer} aspect-square rounded-none`} />
            <div className="flex flex-col gap-2 p-3">
              <div className={`${shimmer} h-4 w-3/4`} />
              <div className={`${shimmer} h-4 w-1/3`} />
              <div className={`${shimmer} mt-1 h-9 w-full`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
