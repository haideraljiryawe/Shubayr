"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";
import type { CartTotals } from "@/lib/cart";
import { percentText } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

/**
 * The mockup's totals block: المجموع الفرعي · رسوم التوصيل · الخصم · الإجمالي.
 * Shared by the cart page and the checkout review so the two can never disagree
 * about what the shopper is about to pay.
 */
export function OrderSummary({
  totals,
  couponCode,
  serverPriced = false,
  deliveryNote,
  children,
}: {
  totals: CartTotals;
  /** Named on the discount row, so the deduction is traceable to its coupon. */
  couponCode?: string | null;
  /**
   * True when these numbers came from the server cart rather than being
   * computed here. Exposed as a data attribute so it is visible in the DOM —
   * "who priced this" is worth being able to see, and to assert on.
   */
  serverPriced?: boolean;
  /**
   * What the delivery line says while the fee is not known yet — "by
   * governorate" in the cart, the chosen governorate at checkout.
   */
  deliveryNote?: string;
  /** The CTA that belongs under the totals, if any. */
  children?: ReactNode;
}) {
  const t = useTranslations("cart");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();

  const amount = (value: number) => formatPrice(value, currency, locale);

  return (
    <Card
      padding="md"
      className="flex flex-col gap-3"
      data-testid="cart-summary"
      data-server-priced={serverPriced ? "true" : "false"}
    >
      <h2 className="text-base font-bold text-text">{t("summary")}</h2>

      <dl className="flex flex-col gap-2.5 text-sm">
        <Row label={t("subtotal")} value={amount(totals.subtotal)} testId="summary-subtotal" />
        <Row
          label={t("delivery")}
          value={totals.deliveryPending ? (deliveryNote ?? t("deliveryByGovernorate")) : amount(totals.deliveryFee)}
          testId="summary-delivery"
          tone={totals.deliveryPending ? "muted" : undefined}
        />
        {totals.tierDiscount > 0 ? (
          <Row
            label={totals.tierPercent !== null ? t("tierDiscount", { percent: percentText(totals.tierPercent, locale) }) : t("tierDiscountPlain")}
            // The minus belongs to the amount, so it is isolated with it.
            value={`−${amount(totals.tierDiscount)}`}
            testId="summary-tier-discount"
            tone="discount"
          />
        ) : null}
        {totals.discount - totals.tierDiscount > 0 ? (
          <Row
            label={couponCode ? `${t("discount")} · ${couponCode}` : t("discount")}
            value={`−${amount(totals.discount - totals.tierDiscount)}`}
            testId="summary-discount"
            tone="discount"
          />
        ) : null}

        <div className="mt-1 border-t border-border pt-3">
          <Row
            label={totals.deliveryPending ? t("totalBeforeDelivery") : t("total")}
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
  /** "muted" is words, not an amount: "by governorate". */
  tone?: "default" | "discount" | "total" | "muted";
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
        dir={tone === "muted" ? "auto" : "ltr"}
        data-testid={testId}
        className={
          (tone === "muted" ? "text-end text-sm text-text-muted " : "whitespace-nowrap [unicode-bidi:isolate] ") +
          (tone === "muted"
            ? ""
            : tone === "total"
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
