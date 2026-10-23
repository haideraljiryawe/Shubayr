"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Card, Input, type BadgeTone } from "@/components/ui";
import { DateFilter } from "@/components/finance/date-filter";
import { DataTable, TableFilter, TableSearch, useTableUrl, type Column, type TableState } from "@/components/table/data-table";
import { moneyText, toFixed } from "@/lib/purchasing";
import { expenseHref, type CashAccountChoice, type ExpenseCategory, type ExpenseStatus, type ExpenseSummary, type ExpenseTotals } from "@/lib/expenses";

export const STATUS_TONE: Record<ExpenseStatus, BadgeTone> = { draft: "warning", posted: "success", reversed: "neutral" };

/** A free-text filter bound to one URL key, debounced like the search box. */
function TextFilter({ name, label }: { name: string; label: string }) {
  const { update, searchParams } = useTableUrl();
  const current = searchParams.get(name) ?? "";
  const [value, setValue] = useState(current);
  useEffect(() => {
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => update({ [name]: value.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // The debounce keys on the text only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Input value={value} onChange={(event) => setValue(event.target.value)} data-testid={`filter-${name}`} />
    </label>
  );
}

export function ExpensesView({
  rows,
  state,
  totals,
  categories,
  cashAccounts,
  ignoredDates,
  canManageCategories,
}: {
  rows: ExpenseSummary[];
  state: TableState;
  totals: ExpenseTotals | null;
  categories: ExpenseCategory[];
  cashAccounts: CashAccountChoice[] | null;
  ignoredDates: boolean;
  canManageCategories: boolean;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const format = useFormatter();
  const iqd = (value: number) => moneyText(toFixed(value), "IQD", 0, locale);
  const amount = (value: number, currency: string) => moneyText(toFixed(value), currency, currency === "IQD" ? 0 : 2, locale);
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", numberingSystem: "latn", timeZone: "Asia/Baghdad" });
  const name = (category: { name_ar: string; name_en: string }) => (locale === "ar" ? category.name_ar : category.name_en) || category.name_ar;

  const columns: Column<ExpenseSummary>[] = [
    {
      key: "number",
      sortKey: "document_number",
      header: t("list.columns.number"),
      cell: (row) => (
        <Link href={expenseHref(row.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="expense-link">
          {row.document_number}
        </Link>
      ),
    },
    { key: "date", sortKey: "document_date", header: t("list.columns.date"), cell: (row) => day(row.document_date) },
    { key: "category", header: t("list.columns.category"), cell: (row) => name(row.category) },
    {
      key: "payee",
      sortKey: "payee",
      header: t("list.columns.payee"),
      cell: (row) => (
        <span>
          {row.supplier?.name ?? row.payee ?? "—"}
          <span className="block text-xs text-text-muted">{row.description}</span>
        </span>
      ),
    },
    {
      key: "amount",
      sortKey: "amount",
      header: t("list.columns.amount"),
      cell: (row) => (
        <span dir="ltr" data-testid="expense-row-amount">
          {amount(row.amount_currency, row.currency_code)}
          {row.currency_code !== "IQD" && row.amount_iqd !== null ? <span className="block text-xs text-text-muted">{iqd(row.amount_iqd)}</span> : null}
        </span>
      ),
    },
    {
      key: "balance",
      header: t("list.columns.balance"),
      cell: (row) => (
        <span dir="ltr" data-testid="expense-row-balance">
          {row.status === "posted" && row.balance_currency > 0 ? amount(row.balance_currency, row.currency_code) : "—"}
        </span>
      ),
    },
    {
      key: "mode",
      header: t("list.columns.mode"),
      cell: (row) => (
        <span>
          {t(`modes.${row.payment_mode}`)}
          {row.cash_account ? <span className="block text-xs text-text-muted">{row.cash_account.name}</span> : null}
        </span>
      ),
    },
    {
      key: "status",
      header: t("list.columns.status"),
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status]} data-testid="expense-row-status" data-status={row.status}>
          {t(`statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {canManageCategories ? (
        <p className="text-sm">
          <Link href="/expenses/categories" className="font-semibold text-primary-dark hover:underline" data-testid="expense-categories-link">
            {t("list.manageCategories")}
          </Link>
        </p>
      ) : null}

      {totals ? (
        <Card className="flex flex-col gap-3 text-sm" data-testid="expense-totals">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">{t("totals.title")}</h2>
            <p>
              <span className="text-text-muted">{t("totals.overall", { count: totals.document_count })}</span>{" "}
              <span dir="ltr" className="text-base font-bold" data-testid="expense-totals-overall">
                {iqd(totals.total_iqd)}
              </span>
            </p>
          </div>
          {totals.per_category.length ? (
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="expense-totals-categories">
              {totals.per_category.map((row) => (
                <li key={row.category.id} className="flex justify-between gap-2 rounded-md bg-card px-3 py-1.5" data-testid="expense-total-category" data-category={row.category.id}>
                  <span>
                    {name(row.category)} <span className="text-xs text-text-muted">({row.document_count})</span>
                  </span>
                  <span dir="ltr" className="font-semibold">
                    {iqd(row.total_iqd)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-text-muted">{t("totals.postedOnly")}</p>
        </Card>
      ) : null}

      {ignoredDates ? <Alert tone="info">{t("list.ignoredDates")}</Alert> : null}
      <DataTable
        testId="expenses-table"
        caption={t("list.title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("list.empty")}
        toolbar={
          <>
            <TableSearch placeholder={t("list.search")} />
            <DateFilter name="from" label={t("list.from")} />
            <DateFilter name="to" label={t("list.to")} />
            <TableFilter
              name="category_id"
              label={t("list.columns.category")}
              options={[{ value: "", label: t("list.any") }, ...categories.map((category) => ({ value: category.id, label: name(category) }))]}
            />
            <TableFilter
              name="status"
              label={t("list.columns.status")}
              options={[{ value: "", label: t("list.any") }, ...(["draft", "posted", "reversed"] as const).map((value) => ({ value, label: t(`statuses.${value}`) }))]}
            />
            {cashAccounts ? (
              <TableFilter
                name="cash_account_id"
                label={t("list.cashAccount")}
                options={[{ value: "", label: t("list.any") }, ...cashAccounts.map((account) => ({ value: account.id, label: account.name }))]}
              />
            ) : null}
            <TextFilter name="payee" label={t("list.columns.payee")} />
            <TableFilter
              name="unpaid_only"
              label={t("list.unpaid")}
              options={[
                { value: "", label: t("list.any") },
                { value: "true", label: t("list.unpaidOnly") },
              ]}
            />
          </>
        }
      />
    </div>
  );
}
