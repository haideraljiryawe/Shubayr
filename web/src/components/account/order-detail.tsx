"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Banknote,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, type Order, type OrderTracking } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { deliveryIdForOrder } from "@/lib/order-delivery";
import { cancelMode, reductionProposal } from "@/lib/order-lifecycle";
import { useResource } from "@/lib/use-resource";
import { AccountError, AccountSkeleton } from "./states";
import { DeliveryStatus } from "./delivery-status";
import { OrderItemLine } from "./order-item-line";
import { OrderReviews } from "./order-reviews";
import { OrderStatusChip, useOrderDate, useOrderDateTime } from "./order-status";
import { TrackingTimeline } from "./tracking-timeline";

/** One order: what was bought, where it goes, how it is paid, and where it is. */
export function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations("orders");

  // The order is the page; the timeline and the address are supporting detail,
  // so each is its own resource and a failure in one never blanks the others.
  const {
    data: order,
    failed,
    reload,
  } = useResource<Order | { notFound: true }>(
    () =>
      api.getOrder(orderId).catch((cause: unknown) => {
        const status = (cause as { status?: number } | null)?.status;
        if (status === 404) return { notFound: true } as const;
        throw cause;
      }),
    [orderId],
  );
  const { data: tracking } = useResource<OrderTracking | null>(
    () => api.trackOrder(orderId).catch(() => null),
    [orderId],
  );
  const missing = order !== null && "notFound" in order;

  if (missing) {
    return (
      <Card padding="lg" className="text-center">
        <Package className="mx-auto size-10 text-text-muted" aria-hidden />
        <h2 className="mt-3 text-lg font-bold text-text">{t("notFound")}</h2>
        <p className="mt-2 text-sm text-text-muted">{t("notFoundBody")}</p>
        <Link
          href="/account/orders"
          className={buttonClasses({ variant: "secondary", className: "mt-5" })}
        >
          {t("backToOrders")}
        </Link>
      </Card>
    );
  }
  if (failed) return <AccountError onRetry={reload} />;
  if (!order) return <AccountSkeleton rows={4} />;

  const found = order as Order;

  // Returns, product reviews and the delivery rating are all things you can
  // only do once the order is in your hands.
  const delivered = found.status === "delivered";
  // API 10.0: a pending order is cancelled directly; from confirmed until
  // delivery the shopper asks, and the store approves or denies. The server
  // decides either way (409 when the order moved on).
  const mode = cancelMode(found);

  return (
    <div className="flex flex-col gap-4">
      <OrderHeader order={found} />
      <OrderItems order={found} />
      {delivered ? <ReturnCta orderId={found.id ?? orderId} /> : null}
      <ReductionPrompt order={found} onAnswered={reload} />
      {mode === "cancel" ? (
        <CancelOrder order={found} onCancelled={reload} />
      ) : null}
      {mode === "request" ? <RequestCancellation order={found} onRequested={reload} /> : null}
      <CancellationStatus order={found} />
      <DeliveryStatus order={found} />
      <TrackingTimeline tracking={tracking} />
      <DeliveryAttempts order={found} />
      {delivered ? (
        <OrderReviews
          order={found}
          deliveryId={deliveryIdForOrder(found)}
          // Writing or deleting a review flips OrderItem.reviewed, which this
          // page renders from, so the order is what has to be re-read.
          onChanged={reload}
        />
      ) : null}
      <DeliveryCard order={found} />
      <PaymentCard />
      <TotalsCard order={found} />

      <Link
        href="/account/orders"
        className={buttonClasses({ variant: "ghost", block: true })}
      >
        <ArrowLeft className="size-4 rtl-flip" aria-hidden />
        {t("backToOrders")}
      </Link>
    </div>
  );
}

/**
 * «إلغاء الطلب» — offered while the status still allows it.
 *
 * The server decides for real: a 409 means the order moved on between the page
 * loading and the click, which is said plainly rather than swallowed.
 */
function CancelOrder({
  order,
  onCancelled,
}: {
  order: Order;
  onCancelled: () => void;
}) {
  const t = useTranslations("orders");
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p
          role="alert"
          data-testid="order-cancel-error"
          className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
        >
          {error}
        </p>
      ) : null}
      <Button
        variant="secondary"
        block
        disabled={busy}
        data-testid="order-cancel"
        startIcon={
          busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <XCircle className="size-4" aria-hidden />
          )
        }
        className="text-error-dark"
        onClick={async () => {
          if (!window.confirm(t("cancelConfirm"))) return;
          setBusy(true);
          setError(null);
          try {
            await api.cancelOrder(order.id!, order.version ?? 1);
            showToast(t("cancelled"));
            onCancelled();
          } catch (cause) {
            setError(
              cause instanceof ApiError && cause.status === 409
                ? t("cancelTooLate")
                : t("cancelFailed"),
            );
            // The order moved on (the store accepted it meanwhile): re-read it,
            // which offers a cancellation request instead.
            if (cause instanceof ApiError && cause.status === 409) onCancelled();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("cancelling") : t("cancelOrder")}
      </Button>
    </div>
  );
}

/**
 * After pending, the shopper asks the store to cancel (API 10.0). The store
 * approves or denies the request; its status shows below until then.
 */
function RequestCancellation({ order, onRequested }: { order: Order; onRequested: () => void }) {
  const t = useTranslations("orders.cancelRequest");
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" block className="text-error-dark" onClick={() => setOpen(true)} data-testid="order-request-cancel" startIcon={<XCircle className="size-4" aria-hidden />}>
        {t("open")}
      </Button>
    );
  }
  return (
    <Card padding="md" className="flex flex-col gap-3" data-testid="order-request-cancel-form">
      <h2 className="text-base font-bold text-text">{t("title")}</h2>
      <p className="text-sm text-text-muted">{t("body")}</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-text">
        {t("reason")}
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
          className="rounded-md border border-border bg-card px-3 py-2 font-normal"
          data-testid="order-request-cancel-reason"
        />
      </label>
      {error ? (
        <p role="alert" className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark" data-testid="order-request-cancel-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.requestCancellation(order.id!, order.version ?? 1, reason.trim());
              showToast(t("sent"));
              onRequested();
            } catch (cause) {
              setError(cause instanceof ApiError && cause.status === 409 ? t("conflict") : t("failed"));
              if (cause instanceof ApiError && cause.status === 409) onRequested();
            } finally {
              setBusy(false);
            }
          }}
          startIcon={busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          data-testid="order-request-cancel-submit"
        >
          {t("submit")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t("back")}
        </Button>
      </div>
    </Card>
  );
}

/** Where the shopper's cancellation request stands. */
function CancellationStatus({ order }: { order: Order }) {
  const t = useTranslations("orders.cancelRequest");
  const request = order.cancellation_request;
  if (!request) return null;
  const tone =
    request.status === "pending"
      ? "border-warning/40 bg-warning/10"
      : request.status === "approved"
        ? "border-success/40 bg-success/10"
        : "border-border bg-card";
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tone}`} role="status" data-testid="order-cancel-request-status" data-status={request.status}>
      <p className="font-semibold text-text">{t(`status.${request.status}`)}</p>
      {request.reason ? <p className="mt-1 text-text-muted">{t("yourReason", { reason: request.reason })}</p> : null}
      {request.resolution_note ? <p className="mt-1 text-text">{t("storeNote", { note: request.resolution_note })}</p> : null}
    </div>
  );
}

/**
 * Preparation came up short and the store proposes a smaller quantity: the
 * shopper accepts it (the order goes on with less) or declines it (the store
 * then cancels the line or the order).
 */
function ReductionPrompt({ order, onAnswered }: { order: Order; onAnswered: () => void }) {
  const t = useTranslations("orders.reduction");
  const locale = useLocale();
  const showToast = useToast();
  const [busy, setBusy] = useState<"accepted" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposal = reductionProposal(order);
  if (!proposal || proposal.status !== "pending") return null;
  const item = (order.items ?? []).find((row) => row.id === proposal.orderItemId);
  const name = (locale === "ar" ? item?.product_name_ar : item?.product_name_en) ?? "";

  async function answer(decision: "accepted" | "denied") {
    setBusy(decision);
    setError(null);
    try {
      await api.respondToShortage(order.id!, order.version ?? 1, decision);
      showToast(decision === "accepted" ? t("acceptedToast") : t("deniedToast"));
      onAnswered();
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409 ? t("conflict") : t("failed"));
      if (cause instanceof ApiError && cause.status === 409) onAnswered();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-3 border-warning/50" data-testid="order-reduction">
      <h2 className="text-base font-bold text-text">{t("title")}</h2>
      <p className="text-sm text-text">
        {t("body", { item: name, from: String(proposal.oldQuantity), to: String(proposal.newQuantity) })}
      </p>
      {proposal.reason ? <p className="text-sm text-text-muted">{t("storeReason", { reason: proposal.reason })}</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-error-dark">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => void answer("accepted")} data-testid="order-reduction-accept">
          {busy === "accepted" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("accept")}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void answer("denied")} data-testid="order-reduction-deny">
          {t("deny")}
        </Button>
      </div>
    </Card>
  );
}

/** Entry point to the return request, shown only on a delivered order. */
function ReturnCta({ orderId }: { orderId: string }) {
  const t = useTranslations("returns");

  return (
    <Link
      href={`/account/orders/${orderId}/return`}
      data-testid="order-return-cta"
      className={buttonClasses({ variant: "secondary", block: true })}
    >
      <RotateCcw className="size-4" aria-hidden />
      {t("request")}
    </Link>
  );
}

function OrderHeader({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const formatDate = useOrderDate();

  return (
    <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="text-sm text-text-muted">{t("orderNumber")}</span>
          <span
            dir="ltr"
            data-testid="order-number"
            className="font-bold text-text [unicode-bidi:isolate]"
          >
            {order.order_number}
          </span>
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {t("placedAt")} {formatDate(order.placed_at)}
        </p>
      </div>
      {order.status ? <OrderStatusChip status={order.status} /> : null}
    </Card>
  );
}

/**
 * The order's lines, rendered from the snapshots the order itself carries.
 *
 * The contract captures `product_name_ar`/`product_name_en` and `image_url`
 * at placement, so this no longer re-fetches the catalogue: a renamed or
 * re-photographed product cannot rewrite what the shopper actually bought,
 * and the page loses a fan-out of product requests.
 */
function OrderItems({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const items = order.items ?? [];

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-text">{t("items")}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <OrderItemLine
              item={item}
              href={`/product/${item.product_id}`}
              className="items-center"
            >
              <span className="flex items-center justify-between gap-3">
                {/* ×N is a Latin-digit run inside an Arabic line. */}
                <span dir="ltr" className="text-xs text-text-muted [unicode-bidi:isolate]">
                  ×{item.quantity}
                </span>
                <Price amount={item.line_total ?? 0} size="sm" />
              </span>
            </OrderItemLine>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Where the order went, from the order's OWN immutable snapshot.
 *
 * Checkout copies the chosen address into `delivery_*` fields in the same
 * transaction that creates the order, and nothing rewrites them afterwards —
 * editing or even deleting the saved address leaves them untouched. Reading
 * the address book instead would show a customer today's address on an order
 * shipped last month, and show nothing at all once they tidied that address
 * away. It also saves a request the page has no other use for.
 */
function DeliveryCard({ order }: { order: Order }) {
  const t = useTranslations("orders");

  const where = [order.delivery_city, order.delivery_area, order.delivery_street]
    .filter(Boolean)
    .join(" — ");

  // A snapshot always has a city; an order predating the snapshot fields has
  // nothing to show rather than something wrong.
  if (!where) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-text">{t("deliveryAddress")}</h2>
        <p className="text-sm text-text-muted">{t("addressMissing")}</p>
      </Card>
    );
  }

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-text">{t("deliveryAddress")}</h2>
      <address
        data-testid="order-address"
        className="flex gap-2 text-sm not-italic text-text-muted"
      >
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden />
        <span className="flex flex-col gap-0.5">
          {order.delivery_address_label ? (
            <span className="font-medium text-text">
              {order.delivery_address_label}
            </span>
          ) : null}
          <span>{where}</span>
          {order.delivery_details ? <span>{order.delivery_details}</span> : null}
          {order.delivery_contact_phone ? (
            <span dir="ltr" className="[unicode-bidi:isolate] text-start">
              {order.delivery_contact_phone}
            </span>
          ) : null}
        </span>
      </address>
    </Card>
  );
}

function PaymentCard() {
  const t = useTranslations("orders");

  return (
    <Card padding="md" className="flex items-center gap-3">
      <Banknote className="size-5 shrink-0 text-primary-dark" aria-hidden />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-text">{t("payment")}</span>
        <span className="text-xs text-text-muted">{t("cod")}</span>
      </div>
    </Card>
  );
}

function TotalsCard({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const amount = (value: number) => formatPrice(value, currency, locale);

  const rows: [string, string, boolean][] = [
    [t("subtotal"), amount(order.subtotal ?? 0), false],
    [t("delivery"), amount(order.delivery_fee ?? 0), false],
    ...((order.discount ?? 0) > 0
      ? ([[t("discount"), `−${amount(order.discount ?? 0)}`, false]] as [
          string,
          string,
          boolean,
        ][])
      : []),
    [t("total"), amount(order.total ?? 0), true],
  ];

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-text">{t("summary")}</h2>
      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map(([label, value, strong]) => (
          <div
            key={label}
            className={
              strong
                ? "mt-1 flex items-center justify-between gap-4 border-t border-border pt-3"
                : "flex items-center justify-between gap-4"
            }
          >
            <dt className={strong ? "text-base font-bold text-text" : "text-text-muted"}>
              {label}
            </dt>
            <dd
              dir="ltr"
              data-testid={strong ? "order-total" : undefined}
              className={
                strong
                  ? "text-lg font-bold text-primary-dark [unicode-bidi:isolate]"
                  : "font-semibold text-text [unicode-bidi:isolate]"
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * Every delivery attempt, oldest first (API 11.0): when the courier set out
 * and how it ended, with the courier's note when an attempt failed. Who
 * carried it stays internal. A retry adds a row; earlier failures stay.
 */
function DeliveryAttempts({ order }: { order: Order }) {
  const t = useTranslations("orders.attempts");
  const formatDateTime = useOrderDateTime();
  const attempts = [...(order.delivery_attempts ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (!attempts.length) return null;
  return (
    <Card padding="md" data-testid="order-delivery-attempts">
      <h2 className="mb-3 text-base font-bold text-text">{t("title")}</h2>
      <ol className="flex flex-col gap-2 text-sm">
        {attempts.map((attempt, index) => (
          <li key={attempt.id} className="flex flex-col gap-0.5 rounded-md bg-card px-3 py-2" data-testid="order-delivery-attempt" data-status={attempt.status}>
            <span className="font-semibold text-text">
              {t("attempt", { number: index + 1 })} · {t(`status.${attempt.status}`)}
            </span>
            <span dir="ltr" className="text-xs text-text-muted [unicode-bidi:isolate] text-start">
              {formatDateTime(attempt.completed_at ?? attempt.started_at)}
            </span>
            {attempt.status === "failed" && attempt.reason ? (
              <span className="text-text-muted" data-testid="order-delivery-attempt-note">
                {t("note", { note: attempt.reason })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
