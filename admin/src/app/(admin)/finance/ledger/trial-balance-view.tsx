"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { formatAmount } from "@/lib/finance/money";
import type { components } from "@/types/api";

type TrialBalance = components["schemas"]["TrialBalance"];

interface Row {
  code: string;
  name_ar?: string;
  name_en?: string;
  type?: string;
  debit: string;
  credit: string;
  balance: string;
}

export function TrialBalanceView({
  balance,
  asOf,
  precision,
}: {
  balance: TrialBalance;
  asOf: string | null;
  /** The base currency's display precision (IQD 0). */
  precision: number;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale();
  const code = balance.currency_code;
  const money = (value: string | number) => formatAmount(value, code, precision, locale);
  const rows = (balance.data ?? []) as unknown as Row[];
  const entriesHref = (account: string) => {
    const params = new URLSearchParams({ account_code: account });
    if (asOf) params.set("to", asOf);
    return `/finance/ledger/entries?${params}`;
  };

  return (
    <Card className="flex flex-col gap-4 overflow-x-auto p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateFilter name="as_of" label={t("asOf")} />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{asOf ? t("asOfDate", { date: asOf }) : t("asOfNow")}</span>
          <Badge tone={balance.balanced ? "success" : "danger"} data-testid="trial-balanced">
            {balance.balanced ? t("balanced") : t("unbalanced")}
          </Badge>
        </div>
      </div>
      <table className="w-full text-sm" data-testid="trial-balance">
        <thead className="text-text-muted">
          <tr>
            <th className="py-1 text-start font-semibold">{t("columns.code")}</th>
            <th className="py-1 text-start font-semibold">{t("columns.account")}</th>
            <th className="py-1 text-end font-semibold">{t("columns.debit")}</th>
            <th className="py-1 text-end font-semibold">{t("columns.credit")}</th>
            <th className="py-1 text-end font-semibold">{t("columns.balance")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-t border-border" data-testid="trial-row" data-code={row.code}>
              <td className="py-1.5">
                <Link href={entriesHref(row.code)} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                  {row.code}
                </Link>
              </td>
              <td className="py-1.5">{locale === "ar" ? row.name_ar : row.name_en}</td>
              <td className="py-1.5 text-end" dir="ltr">{money(row.debit)}</td>
              <td className="py-1.5 text-end" dir="ltr">{money(row.credit)}</td>
              <td className="py-1.5 text-end font-semibold" dir="ltr" data-testid="trial-balance-value">{money(row.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className="py-2" colSpan={2}>{t("totals")}</td>
            <td className="py-2 text-end" dir="ltr" data-testid="trial-debit-total">{money(balance.debit_total)}</td>
            <td className="py-2 text-end" dir="ltr" data-testid="trial-credit-total">{money(balance.credit_total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
