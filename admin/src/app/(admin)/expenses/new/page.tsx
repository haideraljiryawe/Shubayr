import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadExpenseContext } from "@/lib/api/expenses-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { ExpenseForm } from "./expense-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("expenses.form");
  return { title: t("title") };
}

/**
 * A new expense (expenses.create), saved as a draft; it is posted from its
 * own page — by someone else in strict separation-of-duties mode.
 */
export default async function NewExpensePage() {
  const t = await getTranslations("expenses.form");
  const api = await serverApi();
  const context = await loadExpenseContext(api, { forms: true });
  if (!context.permissions.includes("expenses.create")) return <PageError error={new ApiError(403, "expenses.create required")} />;

  return (
    <>
      <Link href="/expenses" className="mb-3 inline-flex items-center gap-1 text-label text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <ExpenseForm
        categories={context.categories.filter((category) => category.is_active)}
        cashAccounts={context.cashAccounts}
        currencies={context.currencies}
        suppliers={context.suppliers}
        today={storeDay()}
        windowDays={context.windowDays}
        canBackdate={context.permissions.includes("backdate.approve")}
        canReadRates={context.permissions.includes("fx_rates.view")}
      />
    </>
  );
}
