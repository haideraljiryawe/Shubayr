"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * «موقع التوصيل — الكوت، العراق». Static in phase 1; it will open the address
 * picker once /addresses is wired up.
 */
export function LocationSelector({ className }: { className?: string }) {
  const t = useTranslations("header");

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1.5",
        "text-start hover:bg-card transition-colors cursor-pointer",
        className,
      )}
    >
      <MapPin className="size-4.5 shrink-0 text-primary" aria-hidden />
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] text-text-muted">{t("deliverTo")}</span>
        <span className="text-sm font-medium text-text">
          {t("defaultLocation")}
        </span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}
