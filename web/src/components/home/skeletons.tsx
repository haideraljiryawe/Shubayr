import { cn } from "@/lib/cn";

/**
 * Suspense fallbacks. Each mirrors the real section's box model so nothing
 * jumps when the data resolves.
 */

const shimmer = "animate-pulse rounded-md bg-card";

export function HeroSkeleton() {
  return (
    <div>
      <div className={cn(shimmer, "min-h-52 rounded-lg sm:min-h-60 lg:min-h-72")} />
      <div className="mt-3 flex justify-center gap-2">
        <span className={cn(shimmer, "h-2 w-6 rounded-full")} />
        <span className={cn(shimmer, "h-2 w-2 rounded-full")} />
        <span className={cn(shimmer, "h-2 w-2 rounded-full")} />
      </div>
    </div>
  );
}

export function CategoryRailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-4 lg:grid-cols-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-24 shrink-0 sm:w-auto">
          <div className={cn(shimmer, "aspect-square w-full")} />
          <div className={cn(shimmer, "mx-auto mt-2 h-3 w-14")} />
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border">
          <div className={cn(shimmer, "aspect-square rounded-none")} />
          <div className="flex flex-col gap-2 p-3">
            <div className={cn(shimmer, "h-4 w-3/4")} />
            <div className={cn(shimmer, "h-4 w-1/3")} />
            <div className={cn(shimmer, "h-3 w-1/2")} />
            <div className={cn(shimmer, "mt-1 h-9 w-full")} />
          </div>
        </div>
      ))}
    </div>
  );
}
