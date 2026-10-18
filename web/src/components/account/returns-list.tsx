"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { Price } from "@/components/ui/price";
import { api, type Return, type ReturnStatus } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

/** Each return status gets the tone that matches what it means for the shopper. */
export const RETURN_STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  requested: "warning",
  approved: "info",
  partially_approved: "info",
  received: "info",
  inspected: "info",
  refunded: "success",
  completed: "success",
  rejected: "error",
};

/**
 * A return quantity as the shopper reads it: "2" pieces, or "0.5 kg" of a
 * weighed product (exact to the thousandth, never 0.49999999).
 */
export function returnQuantity(
  value: number,
  item: { base_unit?: string; whole_units_only?: boolean },
): string {
  const exact = Math.round(value * 1000) / 1000;
  return item.whole_units_only === false ? `${exact} ${item.base_unit ?? ""}`.trim() : String(exact);
}

/** The customer's return requests, newest first. */
export function ReturnsList() {
  const t = useTranslations("returns");
  const {
    data: returns,
    failed,
    reload,
  } = useResource<Return[]>(() => api.listReturns(), []);

  if (failed) return <AccountError message={t("loadError")} onRetry={reload} />;
  if (!returns) return <AccountSkeleton rows={3} />;

  if (returns.length === 0) {
    return (
      <AccountEmpty
        icon={<RotateCcw className="size-7" aria-hidden />}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Link
            href="/account/orders"
            className={buttonClasses({ variant: "cta" })}
          >
            {t("viewOrders")}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="returns-list">
      {returns.map((entry) => (
        <ReturnRow
          key={entry.id}
          entry={entry}
          // Contract 17.0 puts the order NUMBER on the return itself.
          orderNumber={entry.order_number || undefined}
        />
      ))}
    </ul>
  );
}

function ReturnRow({
  entry,
  orderNumber,
}: {
  entry: Return;
  orderNumber?: string;
}) {
  const t = useTranslations("returns");
  const formatDate = useOrderDate();
  const status = (entry.status ?? "requested") as ReturnStatus;
  // Products, not units: half a kilogram of rice is one product.
  const itemCount = (entry.items ?? []).length;

  // Once a return is settled the REFUND is the number that matters; before
  // then it is still an expectation. Both are the server's arithmetic over
  // immutable order-line prices — nothing here multiplies anything out.
  const settled = status === "refunded" || status === "completed";
  const amount = settled
    ? (entry.refund_amount ?? 0)
    : (entry.expected_refund ?? 0);

  return (
    <li>
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t("forOrder")}</span>
              {/* An order number is a Latin-digit run inside Arabic text. */}
              <Link
                href={`/account/orders/${entry.order_id}`}
                dir="ltr"
                data-testid="return-order-link"
                className="font-bold text-text [unicode-bidi:isolate] transition-colors hover:text-primary-dark"
              >
                {orderNumber ?? t("viewOrder")}
              </Link>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t("requestedAt")} {formatDate(entry.created_at)}
            </p>
          </div>

          <Badge
            tone={RETURN_STATUS_TONE[status]}
            data-testid={`return-status-${entry.id}`}
          >
            {t(`status_${status}`)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {t("itemCount", { count: itemCount })}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-sm text-text-muted">
              {settled ? t("refunded") : t("expectedRefund")}
            </span>
            <span data-testid={`return-refund-${entry.id}`}>
              <Price amount={amount} size="sm" />
            </span>
          </p>
        </div>

        {/* Each line's own reason, which the contract requires per item. */}
        <ul className="flex flex-col gap-1 border-t border-border pt-3">
          {(entry.items ?? []).map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
            >
              <span className="text-text">
                {item.customer_reason}
                {/* ×N is a Latin-digit run inside an Arabic line. */}
                <span
                  dir="ltr"
                  className="ms-2 text-xs text-text-muted [unicode-bidi:isolate]"
                >
                  ×{returnQuantity(item.quantity ?? 0, item)}
                </span>
              </span>
              <span className="text-text-muted">
                <Price
                  amount={
                    settled
                      ? (item.approved_refund ?? 0)
                      : (item.net_amount ?? 0)
                  }
                  size="sm"
                />
              </span>
            </li>
          ))}
        </ul>

        {entry.reason ? (
          <p className="border-t border-border pt-3 text-sm text-text-muted">
            {entry.reason}
          </p>
        ) : null}

        <Link
          href={`/account/returns/${entry.id}`}
          data-testid={`return-details-${entry.id}`}
          className="self-start text-sm font-semibold text-primary-dark hover:underline"
        >
          {t("viewDetails")}
        </Link>
      </Card>
    </li>
  );
}
