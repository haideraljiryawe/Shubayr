"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
import { ApiError, api, type LoyaltyAccount, type LoyaltyEntry } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

type LedgerType = NonNullable<LoyaltyEntry["type"]>;

const PER_PAGE = 10;

/** Points balance, the ledger behind it, and spending some. */
export function PointsView() {
  const t = useTranslations("points");
  const [page, setPage] = useState(1);

  const {
    data: loyalty,
    failed,
    reload,
  } = useResource<LoyaltyAccount>(
    () => api.getLoyalty({ page, per_page: PER_PAGE }),
    [page],
  );

  if (failed) return <AccountError message={t("loadError")} onRetry={reload} />;
  if (!loyalty) return <AccountSkeleton rows={4} />;

  const ledger = loyalty.ledger ?? [];
  const total = loyalty.total ?? ledger.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-4">
      {/*
        `points_balance` is the SERVER's figure over the whole append-only
        ledger. Summing the page would be wrong on the first page and absurd
        on the second, so it is rendered exactly as sent.
      */}
      <BalanceCard balance={loyalty.points_balance ?? 0} />

      <RedeemCard
        balance={loyalty.points_balance ?? 0}
        onRedeemed={() => {
          // A redemption is a new newest entry, so go back to page one
          // rather than leaving the shopper looking at a stale slice.
          if (page === 1) reload();
          else setPage(1);
        }}
      />

      {ledger.length === 0 ? (
        <AccountEmpty
          icon={<Sparkles className="size-7" aria-hidden />}
          title={t("empty")}
          body={t("emptyBody")}
        />
      ) : (
        <>
          <LedgerCard entries={ledger} />
          {pageCount > 1 ? (
            <LedgerPager
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Spend points.
 *
 * The balance is only a hint for disabling the button: it can move between
 * this page loading and the press, so the server's 409 is what actually
 * decides, and it is shown rather than swallowed.
 */
function RedeemCard({
  balance,
  onRedeemed,
}: {
  balance: number;
  onRedeemed: () => void;
}) {
  const t = useTranslations("points");
  const showToast = useToast();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const points = Number.parseInt(amount, 10);
  const valid = Number.isInteger(points) && points > 0;

  const submit = useCallback(async () => {
    if (!valid) {
      setError(t("errAmount"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.redeemLoyalty(points);
      showToast(t("redeemed", { count: points }));
      setAmount("");
      onRedeemed();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? t("errBalance")
          : cause instanceof ApiError && cause.status === 422
            ? t("errAmount")
            : t("errRedeemFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [onRedeemed, points, showToast, t, valid]);

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-bold text-text">{t("redeemTitle")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("redeemBody")}</p>
      </div>

      <form
        noValidate
        data-testid="redeem-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <Field label={t("redeemAmount")} htmlFor="redeem-points" error={error}>
          <div className="flex items-start gap-2">
            <Input
              id="redeem-points"
              name="points"
              type="number"
              inputMode="numeric"
              min={1}
              max={balance || undefined}
              // A points figure is a Latin-digit run even in the Arabic UI.
              dir="ltr"
              value={amount}
              invalid={Boolean(error)}
              disabled={busy || balance <= 0}
              placeholder={t("redeemPlaceholder")}
              data-testid="redeem-points"
              onChange={(event) => {
                setAmount(event.target.value);
                if (error) setError(undefined);
              }}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={busy || balance <= 0}
              data-testid="redeem-submit"
              startIcon={
                busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null
              }
              className="h-12 shrink-0"
            >
              {busy ? t("redeeming") : t("redeem")}
            </Button>
          </div>
        </Field>
      </form>
    </Card>
  );
}

function LedgerPager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  const t = useTranslations("points");

  return (
    <div
      className="flex items-center justify-between gap-3"
      data-testid="points-pager"
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        data-testid="points-prev"
        onClick={() => onChange(page - 1)}
      >
        {t("previous")}
      </Button>
      <span className="text-sm text-text-muted" data-testid="points-page">
        {t("pageOf", { page, pageCount })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= pageCount}
        data-testid="points-next"
        onClick={() => onChange(page + 1)}
      >
        {t("next")}
      </Button>
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
