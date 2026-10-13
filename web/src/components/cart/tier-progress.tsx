"use client";

import { useLocale, useTranslations } from "next-intl";
import { BadgePercent } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import type { Locale } from "@/i18n/routing";
import { percentText, type TierProgress as Progress } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The automatic discount, as a goal: "Add 15,000 IQD more to get 10% off",
 * with a bar of how far along the goods subtotal is — or, at the top tier,
 * "You're getting 10% off". The amounts are the server cart's own.
 */
export function TierProgress({ progress, className }: { progress: Progress | null; className?: string }) {
  const t = useTranslations("cart.tiers");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  if (!progress) return null;
  const top = progress.kind === "top";

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-md border border-success/30 bg-success/5 px-4 py-3", className)}
      role="status"
      data-testid="tier-progress"
      data-kind={progress.kind}
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-text">
        <BadgePercent className="mt-0.5 size-4 shrink-0 text-success-dark" aria-hidden />
        <span data-testid="tier-progress-text">
          {top
            ? t("top", { percent: percentText(progress.percent, locale) })
            : t("next", {
                amount: formatPrice(progress.remaining, currency, locale),
                percent: percentText(progress.percent, locale),
              })}
        </span>
      </p>
      {top ? null : (
        <>
          <div
            className="h-2 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.reached * 100)}
            aria-label={t("label")}
          >
            {/* Grows from the start edge: right in Arabic, left in English. */}
            <div className="h-full rounded-full bg-success-dark transition-[width]" style={{ width: `${progress.reached * 100}%` }} />
          </div>
          {progress.current !== null ? (
            <p className="text-xs text-text-muted" data-testid="tier-progress-current">
              {t("current", { percent: percentText(progress.current, locale) })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
