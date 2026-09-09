"use client";

import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Banknote, Loader2, MapPin } from "lucide-react";
import { OrderSummary } from "@/components/cart/order-summary";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { lineName, lineTotal, type CartTotals } from "@/lib/cart";
import type { AppliedCoupon, CartLine } from "@/lib/cart-store";
import type { DeliveryDetails } from "./address-form";

/**
 * The last look before the order is placed: what is being bought, where it is
 * going, how it is paid for and what it costs. Every block links back to the
 * step that owns it, so nothing here has to be editable in place.
 */
export function ReviewStep({
  lines,
  coupon,
  totals,
  delivery,
  error,
  placing,
  onEditAddress,
  onPlaceOrder,
}: {
  lines: CartLine[];
  coupon: AppliedCoupon | null;
  totals: CartTotals;
  delivery: DeliveryDetails;
  error: string | null;
  placing: boolean;
  onEditAddress: () => void;
  onPlaceOrder: () => void;
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const locale = useLocale() as Locale;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Card padding="md" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-text">{t("items")}</h2>
            <Link
              href="/cart"
              data-testid="review-edit-cart"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {t("editCart")}
            </Link>
          </div>

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

        <Card padding="md" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-text">{t("deliverTo")}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditAddress}
              data-testid="review-edit-address"
            >
              {t("editAddress")}
            </Button>
          </div>

          <address className="flex gap-2 text-sm not-italic text-text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-text">{delivery.name}</span>
              <span dir="ltr" className="[unicode-bidi:isolate] self-start">
                {delivery.phone}
              </span>
              <span>
                {[delivery.city, delivery.area, delivery.street]
                  .filter(Boolean)
                  .join(" — ")}
              </span>
              {delivery.details ? <span>{delivery.details}</span> : null}
            </span>
          </address>
        </Card>

        <Card padding="md" className="flex items-center gap-3">
          <Banknote className="size-5 shrink-0 text-primary-dark" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-text">{t("cod")}</span>
            <span className="text-xs text-text-muted">{t("codHint")}</span>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-24">
        <OrderSummary totals={totals} couponCode={coupon?.code}>
          {error ? (
            <p
              role="alert"
              data-testid="checkout-error"
              className="mt-2 flex items-start gap-2 rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <Button
            variant="cta"
            size="lg"
            block
            disabled={placing}
            onClick={onPlaceOrder}
            data-testid="place-order"
            startIcon={
              placing ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : null
            }
            className="mt-2"
          >
            {placing ? t("placing") : t("placeOrder")}
          </Button>
        </OrderSummary>

        <Link
          href="/cart"
          className={buttonClasses({ variant: "ghost", block: true })}
        >
          <ArrowLeft className="size-4 rtl-flip" aria-hidden />
          {tc("title")}
        </Link>
      </div>
    </div>
  );
}
