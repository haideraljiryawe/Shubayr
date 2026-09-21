"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, PackageCheck, Truck, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Order } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  DELIVERY_STAGES,
  deliveryStageForOrder,
  isTerminalStage,
  type DeliveryStage,
} from "@/lib/order-delivery";

/**
 * Where the parcel is: assigned → out for delivery → delivered.
 *
 * This is the delivery record's own vocabulary, projected off the order — see
 * lib/order-delivery.ts for why that projection is exact and why the record
 * itself is not fetchable from a customer session.
 *
 * `failed` and `returned` leave the three-step track, so they are rendered as
 * their own state rather than as a step that never completes.
 */
export function DeliveryStatus({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const stage = deliveryStageForOrder(order);

  // No delivery yet, or an order nobody is delivering any more.
  if (stage === "none") return null;

  if (stage === "failed" || stage === "returned") {
    return (
      <Card padding="md" data-testid="delivery-status" data-stage={stage}>
        <h2 className="text-base font-bold text-text">{t("deliveryStatus")}</h2>
        <p
          role="status"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
            stage === "failed"
              ? "border border-error/40 bg-error/8 text-error-dark"
              : "border border-border bg-card text-text-muted",
          )}
        >
          {stage === "failed" ? (
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
          ) : (
            <Undo2 className="size-4 shrink-0" aria-hidden />
          )}
          {t(`delivery_${stage}`)}
        </p>
      </Card>
    );
  }

  const reached = DELIVERY_STAGES.indexOf(stage);

  return (
    <Card padding="md" data-testid="delivery-status" data-stage={stage}>
      <h2 className="mb-4 text-base font-bold text-text">
        {t("deliveryStatus")}
      </h2>

      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
        {DELIVERY_STAGES.map((step, index) => {
          const done = index < reached;
          const current = index === reached;
          const last = index === DELIVERY_STAGES.length - 1;

          return (
            <li
              key={step}
              data-testid={`delivery-step-${step}`}
              data-state={done ? "done" : current ? "current" : "todo"}
              className="flex flex-1 gap-3 sm:flex-col sm:items-center sm:text-center"
            >
              <div className="flex flex-col items-center sm:w-full sm:flex-row">
                {/* The connector before this dot, on wide layouts. */}
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    index === 0
                      ? "bg-transparent"
                      : done || current
                        ? "bg-primary-dark"
                        : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                    done || current
                      ? "bg-primary-dark text-on-primary"
                      : "bg-card text-text-muted",
                  )}
                >
                  <StageIcon stage={step} done={done} />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    last ? "bg-transparent" : done ? "bg-primary-dark" : "bg-border",
                  )}
                />
                {/* The connector below this dot, on narrow layouts. */}
                {!last ? (
                  <span
                    aria-hidden
                    className={cn(
                      "w-px flex-1 sm:hidden",
                      done ? "bg-primary-dark" : "bg-border",
                    )}
                  />
                ) : null}
              </div>

              <p
                className={cn(
                  "pb-5 text-sm sm:pb-0 sm:pt-2",
                  current
                    ? "font-semibold text-primary-dark"
                    : done
                      ? "text-text"
                      : "text-text-muted",
                )}
              >
                {t(`delivery_${step}`)}
                {current && !isTerminalStage(step) ? (
                  <span className="sr-only"> — {t("deliveryStatus")}</span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StageIcon({ stage, done }: { stage: DeliveryStage; done: boolean }) {
  if (done) return <Check className="size-4" aria-hidden />;
  if (stage === "out_for_delivery") {
    return <Truck className="size-4 rtl-flip" aria-hidden />;
  }
  if (stage === "delivered") return <PackageCheck className="size-4" aria-hidden />;
  return <PackageCheck className="size-4" aria-hidden />;
}
