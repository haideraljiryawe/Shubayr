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
 * `regularPrice` renders the struck-through regular price beside what the
 * shopper actually pays; pass it only when the backend says the product is on
 * sale, since deciding that is not the storefront's job.
 */
export function Price({
  amount,
  regularPrice,
  size = "md",
  className,
}: {
  amount: number;
  regularPrice?: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const { currency } = useTheme();

  return (
    // dir="ltr": a currency symbol is a neutral character, so in an RTL
    // paragraph it drifts to the wrong side of the number without isolation.
    <span
      dir="ltr"
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 [unicode-bidi:isolate]",
        className,
      )}
    >
      <span
        className={cn("whitespace-nowrap font-bold text-text", SIZES[size])}
      >
        {formatPrice(amount, currency, locale)}
      </span>
      {regularPrice ? (
        <span className="whitespace-nowrap text-xs font-medium text-text-muted line-through">
          {formatPrice(regularPrice, currency, locale)}
        </span>
      ) : null}
    </span>
  );
}
