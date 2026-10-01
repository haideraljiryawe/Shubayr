"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StockLevel } from "@/lib/product";

/**
 * «متوفر في المخزون / مخزون منخفض / غير متوفر في المخزون» — the label the API
 * computed for the selected SKU. Never a count: low stock never blocks a sale
 * while stock remains, and how much is left is not the shopper's concern.
 */
export function AvailabilityBadge({
  level,
  className,
}: {
  level: StockLevel;
  className?: string;
}) {
  const t = useTranslations("product");

  const config = {
    in_stock: { Icon: CheckCircle2, label: t("inStock"), tone: "text-success-dark" },
    low_stock: { Icon: TriangleAlert, label: t("lowStock"), tone: "text-warning-dark" },
    out_of_stock: { Icon: XCircle, label: t("outOfStockLabel"), tone: "text-error-dark" },
  }[level];

  const { Icon, label, tone } = config;

  return (
    <p
      data-testid="availability"
      data-level={level}
      className={cn("flex items-center gap-1.5 text-sm font-medium", tone, className)}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </p>
  );
}
