"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, Circle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import { ApiError, api, type Return, type ReturnStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { RETURN_STATUS_TONE, returnQuantity } from "./returns-list";
import { AccountError, AccountSkeleton } from "./states";

/**
 * One return, in the customer's words: where it is, what was accepted, what
 * they get back and how, and what happened to their points. Every amount is
 * the server's — worked out from what they actually paid for each item when
 * they ordered, never from today's prices.
 */
type Stage = "requested" | "reviewed" | "received" | "inspected" | "refunded";
const STAGES: Stage[] = ["requested", "reviewed", "received", "inspected", "refunded"];

/** How far a status has come along the customer's five stages. */
function reached(status: ReturnStatus): number {
  switch (status) {
    case "requested":
      return 0;
    case "approved":
    case "partially_approved":
    case "rejected":
      return 1;
    case "received":
      return 2;
    case "inspected":
      return 3;
    default:
      return 4;
  }
}

export function ReturnDetail({ returnId }: { returnId: string }) {
  const t = useTranslations("returns");
  const { data, failed, reload } = useResource<Return | { notFound: true }>(
    () =>
      api.getReturn(returnId).catch((cause) => {
        if (cause instanceof ApiError && cause.status === 404) return { notFound: true as const };
        throw cause;
      }),
    [returnId],
  );

  if (failed) return <AccountError message={t("loadError")} onRetry={reload} />;
  if (!data) return <AccountSkeleton rows={4} />;
  if ("notFound" in data) {
    return (
      <Card padding="lg" className="text-center" role="alert">
        <p className="font-medium text-text" data-testid="return-not-found">
          {t("notFound")}
        </p>
        <Link href="/account/returns" className={buttonClasses({ variant: "secondary", className: "mt-4" })}>
          {t("backToReturns")}
        </Link>
      </Card>
    );
  }
  return <ReturnBody entry={data} />;
}

function ReturnBody({ entry }: { entry: Return }) {
  const t = useTranslations("returns");
  const formatDate = useOrderDate();
  const locale = useLocale();
  const status = entry.status;
  const rejected = status === "rejected";
  const reviewed = status !== "requested";
  const checked = ["inspected", "refunded", "completed"].includes(status);
  const settled = status === "refunded" || status === "completed";
  const step = reached(status);
  const rejection = entry.events.find((event) => event.type === "rejected")?.note;
  const payment = entry.refund_payments[0];
  const points = entry.points_effect;

  return (
    <div className="flex flex-col gap-4" data-testid="return-detail" data-status={status}>
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-text-muted">
              {t("returnNumber")}{" "}
              <span dir="ltr" className="font-bold text-text [unicode-bidi:isolate]">
                {entry.document_number}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t("forOrder")}</span>
              <Link
                href={`/account/orders/${entry.order_id}`}
                dir="ltr"
                className="font-bold text-text [unicode-bidi:isolate] hover:text-primary-dark"
                data-testid="return-detail-order"
              >
                {entry.order_number}
              </Link>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t("requestedAt")} {formatDate(entry.created_at)}
            </p>
          </div>
          <Badge tone={RETURN_STATUS_TONE[status]} data-testid="return-detail-status">
            {t(`status_${status}`)}
          </Badge>
        </div>
        <p className="text-sm text-text" data-testid="return-detail-explain">
          {t(`explain_${status}`)}
        </p>
        {rejected && rejection ? (
          <p className="rounded-md bg-error/8 px-3 py-2 text-sm text-error-dark" data-testid="return-detail-rejection">
            {t("rejectionReason", { reason: rejection })}
          </p>
        ) : null}
      </Card>

      <Card padding="md">
        <ol className="grid gap-2 sm:grid-cols-5" data-testid="return-detail-stages">
          {STAGES.map((stage, index) => {
            const done = index <= step && !(rejected && index > 1);
            const stopped = rejected && index > 1;
            return (
              <li
                key={stage}
                data-testid={`return-stage-${stage}`}
                data-state={stopped ? "skipped" : done ? "done" : "upcoming"}
                className={cn("flex items-center gap-2 text-sm", done ? "font-semibold text-text" : "text-text-muted", stopped && "line-through")}
              >
                {rejected && index === 1 ? (
                  <X className="size-4 shrink-0 text-error" aria-hidden />
                ) : done ? (
                  <Check className="size-4 shrink-0 text-primary-dark" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0" aria-hidden />
                )}
                {rejected && index === 1 ? t("status_rejected") : t(`stage_${stage}`)}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">{t("items")}</h2>
        <ul className="flex flex-col divide-y divide-border">
          {entry.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-3 text-sm" data-testid={`return-detail-item-${item.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-text">{(locale === "en" ? item.product_name_en : item.product_name_ar) || item.product_name_ar}</span>
                <Price amount={reviewed && !rejected ? item.approved_refund : item.net_amount} size="sm" />
              </div>
              <p className="text-text-muted">
                {t("askedFor")}{" "}
                <span dir="ltr" className="[unicode-bidi:isolate]" data-testid="return-detail-asked">
                  {returnQuantity(item.quantity, item)}
                </span>
                {reviewed && !rejected ? (
                  <>
                    {" · "}
                    {t("accepted")}{" "}
                    <span dir="ltr" className="font-semibold text-text [unicode-bidi:isolate]" data-testid="return-detail-accepted">
                      {returnQuantity(item.approved_quantity, item)}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="text-text-muted">{item.customer_reason}</p>
            </li>
          ))}
        </ul>
      </Card>

      {!rejected ? (
        <Card padding="md" className="flex flex-col gap-2 text-sm" data-testid="return-detail-refund">
          <h2 className="text-base font-bold text-text">{settled ? t("refundDone") : t("refundSoFar")}</h2>
          <Row label={checked ? t("refundTotal") : t("expectedRefund")} amount={checked ? entry.refund_amount : entry.expected_refund} testId="return-detail-total" />
          {entry.delivery_fee_refund > 0 ? <Row label={t("feeIncluded")} amount={entry.delivery_fee_refund} testId="return-detail-fee" /> : null}
          {checked && entry.uncollected_offset > 0 ? (
            <>
              <Row label={t("offsetLabel")} amount={entry.uncollected_offset} testId="return-detail-offset" />
              <p className="text-xs text-text-muted">{t("offsetExplain")}</p>
            </>
          ) : null}
          {checked ? <Row label={settled ? t("paidToYou") : t("toBePaid")} amount={entry.cash_refund_amount} testId="return-detail-cash" strong /> : null}
          {settled && payment ? (
            <p className="text-text-muted" data-testid="return-detail-paid-how">
              {t(payment.method === "cash_account" ? "paidInCash" : "paidByDelivery", { date: formatDate(payment.created_at) })}
            </p>
          ) : null}
          {settled && entry.cash_refund_amount <= 0 ? <p className="text-text-muted">{t("nothingToPay")}</p> : null}
          {!checked ? <p className="text-xs text-text-muted">{t("refundAfterCheck")}</p> : null}
          <p className="text-xs text-text-muted">{t("refundBasis")}</p>
        </Card>
      ) : null}

      {!rejected && (points.earned_reversed > 0 || points.redeemed_restored > 0) ? (
        <Card padding="md" className="flex flex-col gap-1 text-sm" data-testid="return-detail-points">
          <h2 className="text-base font-bold text-text">{t("pointsTitle")}</h2>
          {points.earned_reversed > 0 ? <p>{t(settled ? "pointsRemoved" : "pointsWillBeRemoved", { count: points.earned_reversed })}</p> : null}
          {points.redeemed_restored > 0 ? <p>{t(settled ? "pointsRestored" : "pointsWillBeRestored", { count: points.redeemed_restored })}</p> : null}
          <p className="text-xs text-text-muted">{t("pointsNoCash")}</p>
        </Card>
      ) : null}

      {entry.events.length ? (
        <Card padding="md" className="text-sm" data-testid="return-detail-timeline">
          <h2 className="mb-2 text-base font-bold text-text">{t("timeline")}</h2>
          <ol className="flex flex-col gap-2 border-s border-border ps-4">
            {entry.events.map((event) => (
              <li key={event.id} data-testid="return-detail-event" data-type={event.type}>
                <span className="font-medium text-text">{t(`event_${event.type}`)}</span>
                <span className="ms-2 text-xs text-text-muted">{formatDate(event.created_at)}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Link href="/account/returns" className={buttonClasses({ variant: "ghost", className: "self-start" })}>
        <ArrowLeft className="size-4 rtl-flip" aria-hidden />
        {t("backToReturns")}
      </Link>
    </div>
  );
}

function Row({ label, amount, testId, strong }: { label: string; amount: number; testId: string; strong?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className={cn("text-text-muted", strong && "font-semibold text-text")}>{label}</span>
      <span data-testid={testId}>
        <Price amount={amount} size={strong ? "md" : "sm"} />
      </span>
    </p>
  );
}
