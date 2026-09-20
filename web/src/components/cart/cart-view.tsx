"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import { cartStore } from "@/lib/cart-store";
import { useCart } from "@/lib/use-cart";
import { useCartLineDetails } from "@/lib/cart-sync";
import { CartRow } from "./cart-row";
import { CouponForm } from "./coupon-form";
import { EmptyCart } from "./empty-cart";
import { OrderSummary } from "./order-summary";

/** Placeholder rows while localStorage is read — never an empty cart first. */
function CartSkeleton() {
  const t = useTranslations("cart");
  return (
    <div role="status" aria-label={t("loading")} className="lg:col-span-2">
      <span className="sr-only">{t("loading")}</span>
      <Card padding="md" aria-hidden className="motion-safe:animate-pulse">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex gap-4 border-b border-border py-4 last:border-b-0">
            <div className="size-20 shrink-0 rounded-md bg-card sm:size-24" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-4 w-2/3 rounded bg-card" />
              <div className="h-3 w-1/4 rounded bg-card" />
              <div className="h-8 w-28 rounded-md bg-card" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/**
 * The «سلة المشتريات» screen. Everything it renders comes from the local cart
 * store, so the page works offline and needs no catalogue round-trip.
 */
export function CartView() {
  const t = useTranslations("cart");
  const showToast = useToast();
  const { lines, totals, hydrated, isServerBacked, couponCode } = useCart();

  // A server line this device has never seen carries ids but no name; the
  // catalogue fills that in.
  useCartLineDetails(
    lines.filter((line) => line.unresolved).map((line) => line.product_id),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-text lg:text-3xl">
            {t("title")}
          </h1>
          {hydrated && lines.length > 0 ? (
            <span className="text-sm text-text-muted" data-testid="cart-count">
              {t("itemCount", { count: totals.itemCount })}
            </span>
          ) : null}
        </div>

        {hydrated && lines.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            data-testid="cart-clear"
            onClick={() => {
              void cartStore.clear();
              showToast(t("cleared"));
            }}
            startIcon={<Trash2 className="size-4" aria-hidden />}
            className="text-text-muted hover:text-error-dark"
          >
            {t("clearAll")}
          </Button>
        ) : null}
      </div>

      {!hydrated ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <CartSkeleton />
        </div>
      ) : lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card padding="md">
              <ul data-testid="cart-items">
                {lines.map((line) => (
                  <CartRow
                    key={line.id}
                    line={line}
                    onQuantityChange={(id, quantity) => {
                      void cartStore.setQuantity(id, quantity);
                    }}
                    onRemove={(id) => {
                      void cartStore.removeItem(id);
                      showToast(t("removed"));
                    }}
                  />
                ))}
              </ul>
            </Card>

            <Card padding="md">
              <CouponForm
                couponCode={couponCode}
                onApply={async (code) => {
                  await cartStore.applyCouponCode(code);
                  showToast(t("couponApplied", { code }));
                }}
                // Signed in, the coupon lives on the server cart and the
                // contract offers no way to take it off again.
                onRemove={
                  isServerBacked ? undefined : () => cartStore.removeCoupon()
                }
              />
            </Card>
          </div>

          {/* Sticky on desktop so the totals stay beside a long basket. */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-24">
            <OrderSummary
              totals={totals}
              couponCode={couponCode ?? undefined}
              serverPriced={isServerBacked}
            >
              <Link
                href="/checkout"
                data-testid="cart-checkout"
                className={buttonClasses({
                  variant: "cta",
                  size: "lg",
                  block: true,
                  className: "mt-2",
                })}
              >
                {t("checkout")}
              </Link>
            </OrderSummary>

            <Link
              href="/categories"
              className={buttonClasses({ variant: "ghost", block: true })}
            >
              <ArrowLeft className="size-4 rtl-flip" aria-hidden />
              {t("continueShopping")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
