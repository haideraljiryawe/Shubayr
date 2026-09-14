"use client";

import { useLocale, useTranslations } from "next-intl";
import { Coins, Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/routing";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/cn";
import { formatCount, formatDiscount, formatPrice } from "@/lib/format";

/**
 * Sale price, struck compare-at, discount badge, and the two optional signals
 * the contract carries: `points_price` and `is_negotiable`.
 *
 * Every money/number run is direction-isolated: in an RTL paragraph a currency
 * symbol and a leading minus are neutral characters and drift to the wrong side
 * ("89$", "40%-") without it.
 */
export function PriceBlock({
  price,
  compareAt,
  pointsPrice,
  isNegotiable,
  className,
}: {
  price: number;
  compareAt?: number | null;
  pointsPrice?: number | null;
  isNegotiable?: boolean;
  className?: string;
}) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();

  const discount =
    compareAt && compareAt > price
      ? Math.round(((compareAt - price) / compareAt) * 100)
      : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <span dir="ltr" className="text-3xl font-bold text-text">
          {formatPrice(price, currency, locale)}
        </span>

        {compareAt && compareAt > price ? (
          <span
            dir="ltr"
            className="text-base font-medium text-text-muted line-through"
          >
            {formatPrice(compareAt, currency, locale)}
          </span>
        ) : null}

        {discount ? (
          <Badge tone="sale" dir="ltr">
            {formatDiscount(discount)}
          </Badge>
        ) : null}
      </div>

      {pointsPrice || isNegotiable ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
          {pointsPrice ? (
            <span className="inline-flex items-center gap-1.5">
              <Coins className="size-4 text-accent" aria-hidden />
              {t("pointsPrice", { points: formatCount(pointsPrice, locale) })}
            </span>
          ) : null}

          {isNegotiable ? (
            // Indicator only — negotiation UI is not part of this phase.
            <span className="inline-flex items-center gap-1.5">
              <Handshake className="size-4 text-primary-dark" aria-hidden />
              {t("negotiable")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
