import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadExpenseContext } from "@/lib/api/expenses-server";
import { load, serverApi } from "@/lib/api/server";
import { EXPENSE_FILTER_KEYS, EXPENSE_SORT_KEYS, expenseQueries } from "@/lib/expenses";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { ExpensesView } from "./expenses-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("expenses") };
}

/**
 * Expenses (expenses.read, contract 17.1): the documents, paged, sorted and
 * filtered by the server (dates, category, status, cash account, payee,
 * unpaid only, text), with the filtered range's totals — overall and per
 * category — from their own endpoint.
 */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("expenses.list");
  const params = parseTableParams(await searchParams, {
    sortKeys: EXPENSE_SORT_KEYS,
    defaultSort: "document_date",
    defaultDir: "desc",
    filterKeys: EXPENSE_FILTER_KEYS,
  });
  const api = await serverApi();
  const { list, totals, ignoredDates } = expenseQueries({ filters: params.filters, q: params.q, page: params.page, perPage: params.perPage, sort: params.sort, dir: params.dir });
  const [page, sums, context] = await Promise.all([
    load(api.GET("/admin/expenses", { params: { query: list } })),
    load(api.GET("/admin/expenses/totals", { params: { query: totals } })),
    loadExpenseContext(api, { forms: false }),
  ]);
  if (!page.ok) return <PageError error={page.error} />;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          context.permissions.includes("expenses.create") ? (
            <Link href="/expenses/new" className={buttonClasses({})} data-testid="expense-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <ExpensesView
        rows={page.data.items}
        state={{ page: page.data.pagination.page, perPage: page.data.pagination.per_page, total: page.data.pagination.total, sort: params.sort, dir: params.dir }}
        totals={sums.ok ? sums.data : null}
        categories={context.categories}
        cashAccounts={context.cashAccounts}
        ignoredDates={ignoredDates}
        canManageCategories={context.permissions.includes("expense_categories.manage")}
      />
    </>
  );
}
