"use client";

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { stockLevel } from "@/lib/product";

/** «متوفر / كمية محدودة / نفد» plus the remaining count when it is low. */
export function AvailabilityBadge({
  qty,
  className,
}: {
  qty: number;
  className?: string;
}) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;
  const level = stockLevel(qty);

  const config = {
    in_stock: { Icon: CheckCircle2, label: t("inStock"), tone: "text-success-dark" },
    low_stock: { Icon: TriangleAlert, label: t("lowStock"), tone: "text-warning-dark" },
    out_of_stock: { Icon: XCircle, label: t("outOfStockLabel"), tone: "text-error-dark" },
  }[level];

  const { Icon, label, tone } = config;

  return (
    <p className={cn("flex items-center gap-1.5 text-sm font-medium", tone, className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
      {level === "low_stock" ? (
        <span className="text-text-muted">
          — {t("onlyLeft", { count: formatCount(qty, locale) })}
        </span>
      ) : null}
    </p>
  );
}
