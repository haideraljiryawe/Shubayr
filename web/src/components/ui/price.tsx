"use client";

import { useLocale } from "next-intl";
import { useTheme } from "@/components/providers/theme-provider";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
} as const;

/**
 * Currency always comes from the white-label settings, never a constant.
 * `compareAt` renders the struck-through original beside a discounted price.
 */
export function Price({
  amount,
  compareAt,
  size = "md",
  className,
}: {
  amount: number;
  compareAt?: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const { currency } = useTheme();

  return (
    // dir="ltr": a currency symbol is a neutral character, so in an RTL
    // paragraph it drifts to the wrong side of the number without isolation.
    <span dir="ltr" className={cn("inline-flex items-baseline gap-2", className)}>
      <span className={cn("font-bold text-text", SIZES[size])}>
        {formatPrice(amount, currency, locale)}
      </span>
      {compareAt && compareAt > amount ? (
        <span className="text-xs font-medium text-text-muted line-through">
          {formatPrice(compareAt, currency, locale)}
        </span>
      ) : null}
    </span>
  );
}
