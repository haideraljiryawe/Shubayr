"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Banknote, MapPin, Package, Phone, User } from "lucide-react";
import { ORDER_STATUS_TONES } from "@/components/account/order-status";
import { AccountError, AccountSkeleton } from "@/components/account/states";
import { useTheme } from "@/components/providers/theme-provider";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, ApiError, type MonitorOrderDetail as Detail } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useStoreDateTime } from "@/lib/store-time";
import { useResource } from "@/lib/use-resource";

/**
 * One order, for reading only.
 *
 * Deliberately plain: the contract strips product images from this response
 * and the monitor role may change nothing, so the page has text and numbers
 * and not one control besides the way back.
 */
export function MonitorOrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations("monitor");
  const tWork = useTranslations("work");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const dateTime = useStoreDateTime();
  const price = (amount: number) => formatPrice(amount, currency, locale);

  const { data, failed, reload } = useResource<Detail | { notFound: true }>(
    () =>
      api.getMonitorOrder(orderId).catch((cause: unknown) => {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 422)) {
          return { notFound: true } as const;
        }
        throw cause;
      }),
    [orderId],
  );

  const back = (
    <Link
      href="/monitor/orders"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark"
      data-testid="monitor-back"
    >
      <ArrowLeft className="size-4 rtl-flip" aria-hidden />
      {t("backToList")}
    </Link>
  );

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <AccountError message={tWork("loadError")} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <AccountSkeleton rows={4} />;
  if ("notFound" in data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card padding="lg" className="text-center" data-testid="monitor-not-found">
          <Package className="mx-auto size-10 text-text-muted" aria-hidden />
          <h2 className="mt-3 text-lg font-bold text-text">{t("notFound")}</h2>
          <Link
            href="/monitor/orders"
            className={buttonClasses({ variant: "secondary", className: "mt-5" })}
          >
            {t("backToList")}
          </Link>
        </Card>
      </div>
    );
  }

  const order = data;
  const address = order.shipping_snapshot;
  const addressLine = [address.city, address.area, address.street, address.details]
    .filter(Boolean)
    .join("، ");

  return (
    <div className="flex flex-col gap-4" data-testid="monitor-order-detail">
      {back}

      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("orderNumber")}</span>
          <h2 className="text-xl font-bold text-text" dir="ltr" data-testid="monitor-detail-number">
            {order.order_number}
          </h2>
          <span className="text-xs text-text-muted">{dateTime(order.placed_at)}</span>
        </div>
        <Badge
          tone={ORDER_STATUS_TONES[order.status] ?? "neutral"}
          data-testid="monitor-detail-status"
          data-status={order.status}
        >
          {tWork(`orderStatus.${order.status}`)}
        </Badge>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card padding="md" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-bold text-text">
            <User className="size-4" aria-hidden />
            {t("customer")}
          </h3>
          <p className="text-text" data-testid="monitor-detail-customer">
            {order.customer.name || t("noName")}
          </p>
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Phone className="size-4" aria-hidden />
            <span dir="ltr" data-testid="monitor-detail-phone">
              {order.customer.phone}
            </span>
          </p>
        </Card>

        <Card padding="md" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-bold text-text">
            <MapPin className="size-4" aria-hidden />
            {t("address")}
          </h3>
          {address.address_label ? (
            <p className="text-sm font-semibold text-text">{address.address_label}</p>
          ) : null}
          <p className="text-sm text-text" data-testid="monitor-detail-address">
            {addressLine}
          </p>
          {address.contact_phone ? (
            <p className="text-sm text-text-muted">
              {t("contactPhone")}: <span dir="ltr">{address.contact_phone}</span>
            </p>
          ) : null}
        </Card>
      </div>

      <Card padding="md" className="flex flex-col gap-3">
        <h3 className="font-bold text-text">{t("items")}</h3>
        <ul className="flex flex-col divide-y divide-border" data-testid="monitor-detail-items">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2"
              data-testid="monitor-detail-item"
            >
              <div className="flex flex-col">
                <span className="text-text">
                  {locale === "ar" ? item.product_name_ar : item.product_name_en}
                </span>
                <span className="text-sm text-text-muted" data-testid="monitor-detail-qty">
                  {t("quantity", { count: item.quantity })}
                </span>
              </div>
              <span className="font-semibold text-text">{price(item.line_total)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md" className="flex flex-col gap-2">
        <h3 className="font-bold text-text">{t("summary")}</h3>
        <dl className="flex flex-col gap-1 text-sm">
          <Row label={t("subtotal")} value={price(order.subtotal)} />
          <Row label={t("deliveryFee")} value={price(order.delivery_fee)} />
          {order.discount ? (
            <Row label={t("discount")} value={`-${price(order.discount)}`} />
          ) : null}
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold text-text">
            <dt>{t("total")}</dt>
            <dd data-testid="monitor-detail-total">{price(order.total)}</dd>
          </div>
        </dl>
        <p className="mt-2 flex items-center gap-2 text-sm text-text">
          <Banknote className="size-4" aria-hidden />
          {t("payment")}:{" "}
          <span data-testid="monitor-detail-payment">
            {order.payment_method === "cod" ? t("cod") : order.payment_method}
          </span>
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-text-muted">
      <dt>{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
