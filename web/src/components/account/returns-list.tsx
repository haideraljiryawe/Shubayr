"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { Price } from "@/components/ui/price";
import { api, type Order, type Return, type ReturnStatus } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

/** Each return status gets the tone that matches what it means for the shopper. */
const STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  requested: "warning",
  approved: "info",
  partially_approved: "info",
  completed: "success",
  rejected: "error",
};

/** The customer's return requests, newest first. */
export function ReturnsList() {
  const t = useTranslations("returns");
  const {
    data: returns,
    failed,
    reload,
  } = useResource<Return[]>(() => api.listReturns(), []);

  // A Return carries `order_id` but not the order NUMBER, and a raw UUID is
  // not something to show a shopper. One orders read maps them; a failure
  // here costs the human-readable label, never the list.
  const { data: orders } = useResource<Order[]>(
    () => api.listOrders().catch(() => []),
    [],
  );
  const orderNumbers = new Map(
    (orders ?? []).map((order) => [order.id, order.order_number]),
  );

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
          orderNumber={orderNumbers.get(entry.order_id)}
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
  const itemCount = (entry.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0,
  );

  // Once a return is settled the REFUND is the number that matters; before
  // then it is still an expectation. Both are the server's arithmetic over
  // immutable order-line prices — nothing here multiplies anything out.
  const settled = status === "completed";
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

          <Badge tone={STATUS_TONE[status]} data-testid={`return-status-${entry.id}`}>
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
                <span dir="ltr" className="ms-2 text-xs text-text-muted [unicode-bidi:isolate]">
                  ×{item.quantity}
                </span>
              </span>
              <span className="text-text-muted">
                <Price
                  amount={
                    settled
                      ? (item.approved_refund ?? 0)
                      : (item.expected_refund ?? 0)
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
      </Card>
    </li>
  );
}
