"use client";

import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";
import { api, type LoyaltyAccount, type LoyaltyEntry } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

type LedgerType = NonNullable<LoyaltyEntry["type"]>;

/** Points balance and the ledger behind it. Read-only for a customer. */
export function PointsView() {
  const t = useTranslations("points");
  const {
    data: loyalty,
    failed,
    reload,
  } = useResource<LoyaltyAccount>(() => api.getLoyalty(), []);

  if (failed) return <AccountError message={t("loadError")} onRetry={reload} />;
  if (!loyalty) return <AccountSkeleton rows={4} />;

  const ledger = loyalty.ledger ?? [];

  return (
    <div className="flex flex-col gap-4">
      <BalanceCard balance={loyalty.points_balance ?? 0} />

      {ledger.length === 0 ? (
        <AccountEmpty
          icon={<Sparkles className="size-7" aria-hidden />}
          title={t("empty")}
          body={t("emptyBody")}
        />
      ) : (
        <LedgerCard entries={ledger} />
      )}
    </div>
  );
}

function BalanceCard({ balance }: { balance: number }) {
  const t = useTranslations("points");
  const locale = useLocale() as Locale;

  return (
    <Card padding="lg" className="flex flex-col items-center gap-1 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <p className="mt-2 text-sm text-text-muted">{t("balance")}</p>
      {/* A points total is a Latin-digit run: isolate it from the RTL text. */}
      <p
        dir="ltr"
        data-testid="points-balance"
        className="text-4xl font-bold text-primary-dark [unicode-bidi:isolate]"
      >
        {formatCount(balance, locale)}
      </p>
      <p className="text-sm font-medium text-text">{t("unit")}</p>
      <p className="mx-auto mt-2 max-w-sm text-xs text-text-muted">
        {t("balanceHint")}
      </p>
    </Card>
  );
}

function LedgerCard({ entries }: { entries: LoyaltyEntry[] }) {
  const t = useTranslations("points");
  const locale = useLocale() as Locale;
  const formatDate = useOrderDate();

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-text">{t("ledger")}</h2>
      <ul className="flex flex-col divide-y divide-border" data-testid="points-ledger">
        {entries.map((entry, index) => {
          const points = entry.points ?? 0;
          const credit = points >= 0;
          const type = (entry.type ?? "adjust") as LedgerType;

          return (
            <li
              key={`${entry.created_at ?? index}-${index}`}
              className="flex items-center gap-3 py-3"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  credit
                    ? "bg-success/15 text-success-dark"
                    : "bg-error/12 text-error-dark",
                )}
              >
                {credit ? (
                  <Plus className="size-4" aria-hidden />
                ) : (
                  <Minus className="size-4" aria-hidden />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">
                  {t(`type_${type}`)}
                </span>
                <span className="block text-xs text-text-muted">
                  {formatDate(entry.created_at)}
                </span>
              </span>

              {/* The sign is a neutral character and would hop to the far side
                  of the number in an RTL run without the isolate. */}
              <span
                dir="ltr"
                className={cn(
                  "shrink-0 text-sm font-bold [unicode-bidi:isolate]",
                  credit ? "text-success-dark" : "text-error-dark",
                )}
              >
                {credit ? "+" : "−"}
                {formatCount(Math.abs(points), locale)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
