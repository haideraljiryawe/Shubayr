"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Rating } from "@/components/ui/rating";
import type { Review } from "@/lib/api";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";

const PER_PAGE = 5;

/**
 * Read-only reviews: average, a five-bar distribution, and the paginated list.
 *
 * Writing a review requires a purchased order item (the contract enforces that
 * on POST /products/{id}/reviews), so composing lands with the account phase.
 *
 * All reviews are passed in and paged on the client. The list is small and
 * already fetched server-side for SEO; re-fetching per page would cost a round
 * trip and hide the reviews from crawlers.
 */
export function ProductReviews({
  reviews,
  total,
  ratingAvg,
  id,
}: {
  reviews: Review[];
  total: number;
  ratingAvg: number;
  id: string;
}) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 => 1 star
    for (const review of reviews) {
      const stars = review.rating ?? 0;
      if (stars >= 1 && stars <= 5) counts[stars - 1] += 1;
    }
    return counts;
  }, [reviews]);

  const pageCount = Math.max(1, Math.ceil(reviews.length / PER_PAGE));
  const visible = reviews.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const PrevIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-IQ" : "en-US",
    { year: "numeric", month: "long", day: "numeric", numberingSystem: "latn" },
  );

  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="text-xl font-bold text-text">{t("reviews")}</h2>

      {reviews.length === 0 ? (
        <Card tone="muted" padding="lg" className="mt-4 text-center">
          <p className="text-sm text-text-muted">{t("noReviews")}</p>
        </Card>
      ) : (
        <>
          <Card padding="lg" className="mt-4">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10">
              <div className="text-center">
                <p dir="ltr" className="text-4xl font-bold text-text">
                  {formatRating(ratingAvg, locale)}
                </p>
                <Rating value={ratingAvg} showStars showValue={false} className="mt-1 justify-center" />
                <p className="mt-1 text-xs text-text-muted">
                  {t("basedOn", { count: formatCount(total, locale) })}
                </p>
              </div>

              <ul className="flex flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = distribution[stars - 1];
                  const pct = reviews.length
                    ? Math.round((count / reviews.length) * 100)
                    : 0;
                  return (
                    <li key={stars} className="flex items-center gap-2">
                      <span
                        dir="ltr"
                        className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-xs text-text-muted"
                      >
                        {stars}
                        <Star className="size-3 fill-accent text-accent" aria-hidden />
                      </span>
                      <span
                        className="h-2 flex-1 overflow-hidden rounded-full bg-card"
                        role="img"
                        aria-label={`${t("ratingBar", { stars })}: ${pct}%`}
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span
                        dir="ltr"
                        className="w-8 shrink-0 text-end text-xs text-text-muted"
                      >
                        {formatCount(count, locale)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>

          <ul className="mt-4 flex flex-col gap-3">
            {visible.map((review) => (
              <li key={review.id}>
                <Card padding="md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Rating value={review.rating ?? 0} showStars />
                    {review.verified_purchase ? (
                      <Badge tone="success" className="gap-1">
                        <BadgeCheck className="size-3.5" aria-hidden />
                        {t("verifiedPurchase")}
                      </Badge>
                    ) : null}
                  </div>

                  {review.comment ? (
                    <p className="mt-2 text-sm leading-6 text-text">
                      {review.comment}
                    </p>
                  ) : null}

                  {review.created_at ? (
                    <time
                      dateTime={review.created_at}
                      className="mt-2 block text-xs text-text-muted"
                    >
                      {dateFormatter.format(new Date(review.created_at))}
                    </time>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label={t("reviewsPrev")}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-md border border-border",
                  "text-text transition-colors hover:bg-card",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <PrevIcon className="size-4" aria-hidden />
              </button>

              <span aria-live="polite" className="text-sm text-text-muted">
                {t("reviewsPage", { page, total: pageCount })}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                aria-label={t("reviewsNext")}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-md border border-border",
                  "text-text transition-colors hover:bg-card",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <NextIcon className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
