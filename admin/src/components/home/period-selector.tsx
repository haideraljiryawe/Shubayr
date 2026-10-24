"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { homePeriodHref, type HomePeriod, type HomePeriodKind } from "@/lib/home-period";

/**
 * The one period for the performance figures (VIS-003): Today, This month,
 * or a custom range in business dates (up to today). The choice lives in the
 * URL, so it survives a reload and can be shared.
 */
export function PeriodSelector({ period, today }: { period: HomePeriod; today: string }) {
  const t = useTranslations("dashboard.performance");
  const router = useRouter();
  const [kind, setKind] = useState<HomePeriodKind>(period.kind);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const invalid = !from || !to || from > to || to > today;

  function go(next: HomePeriod) {
    router.push(homePeriodHref(next), { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="period-selector">
      <div role="group" aria-label={t("period")} className="inline-flex w-fit rounded-md border border-field bg-surface p-0.5">
        {(["today", "month", "custom"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            data-testid={`period-${option}`}
            onClick={() => {
              setKind(option);
              if (option === "today") go({ kind: "today", from: today, to: today });
              if (option === "month") go({ kind: "month", from: `${today.slice(0, 8)}01`, to: today });
            }}
            className={cn(
              "cursor-pointer rounded px-3 py-1.5 text-label transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              kind === option ? "bg-primary-dark text-on-primary" : "text-text-muted hover:bg-card hover:text-text",
            )}
          >
            {t(option)}
          </button>
        ))}
      </div>
      {kind === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) go({ kind: "custom", from, to });
          }}
        >
          <label className="flex flex-col gap-1 text-caption text-text-muted">
            {t("from")}
            <Input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} className="w-40" data-testid="period-from" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-text-muted">
            {t("to")}
            <Input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} className="w-40" data-testid="period-to" />
          </label>
          <Button type="submit" variant="secondary" disabled={invalid} data-testid="period-apply">
            {t("apply")}
          </Button>
          {from && to && from > to ? <p className="w-full text-caption text-error-dark">{t("reversed")}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
