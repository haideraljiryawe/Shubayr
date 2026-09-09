"use client";

import { useLocale, useTranslations } from "next-intl";
import { Banknote, CheckCircle2, Truck } from "lucide-react";
import { OrderSummary } from "@/components/cart/order-summary";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Order } from "@/lib/api";
import { lineName, lineTotal, type CartTotals } from "@/lib/cart";
import type { CartLine } from "@/lib/cart-store";

/**
 * Order placed. The basket is cleared by then, so this screen renders from the
 * snapshot taken at submit time plus the order the API returned.
 */
export function Confirmation({
  order,
  lines,
  totals,
  couponCode,
}: {
  order: Order;
  lines: CartLine[];
  totals: CartTotals;
  couponCode?: string | null;
}) {
  const t = useTranslations("checkout");
  const locale = useLocale() as Locale;

  return (
    <div
      className="mx-auto flex max-w-2xl flex-col gap-5"
      data-testid="order-confirmation"
    >
      <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-14 text-success-dark" aria-hidden />
        {/* The page's h1 is «إتمام الطلب» in the flow wrapper; this is the
            outcome inside it, so it sits one level down. */}
        <h2 className="text-2xl font-bold text-text">{t("confirmTitle")}</h2>
        <p className="text-sm text-text-muted">{t("confirmBody")}</p>

        <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-text-muted">{t("orderNumber")}</span>
          {/* An order number is a Latin identifier: isolate it from the RTL run. */}
          <span
            dir="ltr"
            data-testid="order-number"
            className="rounded-md bg-card px-3 py-1 font-bold text-primary-dark [unicode-bidi:isolate]"
          >
            {order.order_number}
          </span>
        </p>

        <span className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-text">
          <Banknote className="size-4 text-primary-dark" aria-hidden />
          {t("cod")}
        </span>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">{t("items")}</h2>
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">
                  {lineName(line, locale)}
                </p>
                <p className="text-xs text-text-muted">
                  {line.variant_label ? `${line.variant_label} · ` : ""}
                  <span dir="ltr" className="[unicode-bidi:isolate]">
                    ×{line.quantity}
                  </span>
                </p>
              </div>
              <Price amount={lineTotal(line)} size="sm" />
            </li>
          ))}
        </ul>
      </Card>

      <OrderSummary totals={totals} couponCode={couponCode} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/orders/${order.id}/track`}
          data-testid="track-order"
          className={buttonClasses({
            variant: "cta",
            size: "lg",
            block: true,
            className: "sm:flex-1",
          })}
        >
          <Truck className="size-5 rtl-flip" aria-hidden />
          {t("trackOrder")}
        </Link>
        <Link
          href="/categories"
          className={buttonClasses({
            variant: "secondary",
            size: "lg",
            block: true,
            className: "sm:flex-1",
          })}
        >
          {t("keepShopping")}
        </Link>
      </div>
    </div>
  );
}
