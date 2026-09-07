"use client";

import { useLocale } from "next-intl";
import { Star } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";

/**
 * «★ 4.6 (98)» — gold star, value, then the review count in muted text.
 * `count` is optional because the Product contract only guarantees rating_avg.
 */
export function Rating({
  value,
  count,
  showStars = false,
  className,
}: {
  value: number;
  count?: number;
  /** Render all five stars instead of the single compact star. */
  showStars?: boolean;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const rounded = Math.round(value);

  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-1 [unicode-bidi:isolate]",
        className,
      )}
      aria-label={`${formatRating(value, locale)} / 5`}
    >
      {showStars ? (
        <span className="inline-flex items-center gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                "size-4",
                i <= rounded
                  ? "fill-accent text-accent"
                  : "fill-border text-border",
              )}
            />
          ))}
        </span>
      ) : (
        <Star className="size-4 fill-accent text-accent" aria-hidden />
      )}

      <span className="text-sm font-semibold text-text">
        {formatRating(value, locale)}
      </span>

      {typeof count === "number" ? (
        <span className="text-xs text-text-muted">
          ({formatCount(count, locale)})
        </span>
      ) : null}
    </span>
  );
}
