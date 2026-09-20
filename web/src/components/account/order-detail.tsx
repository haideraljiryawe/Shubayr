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
import {
  api,
  ApiError,
  type Address,
  type Order,
  type OrderTracking,
} from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { deliveryIdForOrder } from "@/lib/order-delivery";
import { useResource } from "@/lib/use-resource";
import { AccountError, AccountSkeleton } from "./states";
import { OrderItemLine } from "./order-item-line";
import { OrderReviews } from "./order-reviews";
import { OrderStatusChip, useOrderDate } from "./order-status";
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
  const { data: addresses } = useResource<Address[]>(
    () => api.listAddresses().catch(() => []),
    [],
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
  const address =
    addresses?.find((item) => item.id === found.address_id) ?? null;

  // Returns, product reviews and the delivery rating are all things you can
  // only do once the order is in your hands.
  const delivered = found.status === "delivered";
  // The server is the authority on cancellability and answers 409 otherwise;
  // this only decides whether offering the button makes sense at all.
  const cancellable =
    found.status === "pending" || found.status === "confirmed";

  return (
    <div className="flex flex-col gap-4">
      <OrderHeader order={found} />
      <OrderItems order={found} />
      {delivered ? <ReturnCta orderId={found.id ?? orderId} /> : null}
      {cancellable ? (
        <CancelOrder orderId={found.id ?? orderId} onCancelled={reload} />
      ) : null}
      <TrackingTimeline tracking={tracking} />
      {delivered ? (
        <OrderReviews order={found} deliveryId={deliveryIdForOrder(found)} />
      ) : null}
      <DeliveryCard address={address} />
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
  orderId,
  onCancelled,
}: {
  orderId: string;
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
            await api.cancelOrder(orderId);
            showToast(t("cancelled"));
            onCancelled();
          } catch (cause) {
            setError(
              cause instanceof ApiError && cause.status === 409
                ? t("cancelTooLate")
                : t("cancelFailed"),
            );
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

function DeliveryCard({ address }: { address: Address | null }) {
  const t = useTranslations("orders");

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-text">{t("deliveryAddress")}</h2>
      {address ? (
        <address className="flex gap-2 text-sm not-italic text-text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden />
          <span className="flex flex-col gap-0.5">
            {address.label ? (
              <span className="font-medium text-text">{address.label}</span>
            ) : null}
            <span>
              {[address.city, address.area, address.street]
                .filter(Boolean)
                .join(" — ")}
            </span>
            {address.details ? <span>{address.details}</span> : null}
          </span>
        </address>
      ) : (
        // An order keeps its address_id after the address itself is deleted,
        // so this is the normal "you removed it later" case.
        <p className="text-sm text-text-muted">{t("addressMissing")}</p>
      )}
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
