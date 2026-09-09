"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";
import type { CartTotals } from "@/lib/cart";
import { formatPrice } from "@/lib/format";

/**
 * The mockup's totals block: المجموع الفرعي · رسوم التوصيل · الخصم · الإجمالي.
 * Shared by the cart page and the checkout review so the two can never disagree
 * about what the shopper is about to pay.
 */
export function OrderSummary({
  totals,
  couponCode,
  children,
}: {
  totals: CartTotals;
  /** Named on the discount row, so the deduction is traceable to its coupon. */
  couponCode?: string | null;
  /** The CTA that belongs under the totals, if any. */
  children?: ReactNode;
}) {
  const t = useTranslations("cart");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();

  const amount = (value: number) => formatPrice(value, currency, locale);

  return (
    <Card padding="md" className="flex flex-col gap-3" data-testid="cart-summary">
      <h2 className="text-base font-bold text-text">{t("summary")}</h2>

      <dl className="flex flex-col gap-2.5 text-sm">
        <Row label={t("subtotal")} value={amount(totals.subtotal)} testId="summary-subtotal" />
        <Row
          label={t("delivery")}
          value={amount(totals.deliveryFee)}
          testId="summary-delivery"
        />
        {totals.discount > 0 ? (
          <Row
            label={couponCode ? `${t("discount")} · ${couponCode}` : t("discount")}
            // The minus belongs to the amount, so it is isolated with it.
            value={`−${amount(totals.discount)}`}
            testId="summary-discount"
            tone="discount"
          />
        ) : null}

        <div className="mt-1 border-t border-border pt-3">
          <Row
            label={t("total")}
            value={amount(totals.total)}
            testId="summary-total"
            tone="total"
          />
        </div>
      </dl>

      {children}
    </Card>
  );
}

function Row({
  label,
  value,
  testId,
  tone = "default",
}: {
  label: string;
  value: string;
  testId: string;
  tone?: "default" | "discount" | "total";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt
        className={
          tone === "total"
            ? "text-base font-bold text-text"
            : "text-text-muted"
        }
      >
        {label}
      </dt>
      {/* dir="ltr": currency symbols and the discount's minus are neutral
          characters and drift to the wrong side of the number in RTL. */}
      <dd
        dir="ltr"
        data-testid={testId}
        className={
          "whitespace-nowrap [unicode-bidi:isolate] " +
          (tone === "total"
            ? "text-lg font-bold text-primary-dark"
            : tone === "discount"
              ? "font-semibold text-success-dark"
              : "font-semibold text-text")
        }
      >
        {value}
      </dd>
    </div>
  );
}
