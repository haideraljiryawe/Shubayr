"use client";

import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { OrderStatus, OrderTracking } from "@/lib/api";
import { cn } from "@/lib/cn";
import { statusLabelKey, useOrderDateTime } from "./order-status";

/**
 * GET /orders/{id}/track rendered as a vertical timeline.
 *
 * The contract returns the events that have happened, oldest first, so the last
 * one is where the order stands now — that is the only "current" step, and
 * everything above it is done. No step is invented for a future the backend
 * has not reported.
 */
export function TrackingTimeline({
  tracking,
}: {
  tracking: OrderTracking | null;
}) {
  const t = useTranslations("orders");
  const formatDateTime = useOrderDateTime();

  const events = tracking?.events ?? [];

  if (events.length === 0) {
    return (
      <Card padding="md">
        <h2 className="text-base font-bold text-text">{t("tracking")}</h2>
        <p className="mt-3 text-sm text-text-muted" role="status">
          {t("trackingEmpty")}
        </p>
      </Card>
    );
  }

  // Newest at the top reads better on a phone, so render the reverse and mark
  // the first one as where the order is now.
  const ordered = [...events].reverse();

  return (
    <Card padding="md" data-testid="order-tracking">
      <h2 className="mb-4 text-base font-bold text-text">{t("tracking")}</h2>

      <ol className="flex flex-col">
        {ordered.map((event, index) => {
          const current = index === 0;
          const last = index === ordered.length - 1;
          const status = event.status as OrderStatus | undefined;

          return (
            <li key={`${event.status}-${event.at}`} className="flex gap-3">
              {/* Marker column: dot plus the connector to the step below. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                    current
                      ? "bg-primary-dark text-on-primary"
                      : "bg-card text-primary-dark",
                  )}
                >
                  {current ? (
                    <Circle className="size-3 fill-current" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                </span>
                {!last ? (
                  <span className="w-px flex-1 bg-border" aria-hidden />
                ) : null}
              </div>

              <div className={cn("min-w-0 pb-5", last && "pb-0")}>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    current ? "text-primary-dark" : "text-text",
                  )}
                >
                  {status ? t(statusLabelKey(status)) : ""}
                  {current ? (
                    <span className="sr-only"> — {t("tracking")}</span>
                  ) : null}
                </p>
                <p
                  dir="ltr"
                  className="mt-0.5 text-xs text-text-muted [unicode-bidi:isolate] text-start"
                >
                  {formatDateTime(event.at)}
                </p>
                {event.note ? (
                  <p className="mt-1 text-sm text-text-muted">{event.note}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
