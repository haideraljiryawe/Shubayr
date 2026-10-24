import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadExpenseContext } from "@/lib/api/expenses-server";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import { ExpenseView } from "./expense-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("expenses.detail");
  return { title: t("title") };
}

/** One expense: its amounts, receipt, payments, journal entries, corrections and the actions this person may take. */
export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("expenses.detail");
  const api = await serverApi();
  const [expense, context] = await Promise.all([
    load(api.GET("/admin/expenses/{id}", { params: { path: { id } } })),
    loadExpenseContext(api, { forms: true }),
  ]);
  if (!expense.ok) {
    if (expense.error.status === 404) notFound();
    return <PageError error={expense.error} />;
  }

  return (
    <>
      <Link href="/expenses" className="mb-3 inline-flex items-center gap-1 text-label text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={<span dir="ltr" data-testid="expense-number">{expense.data.document_number}</span>} description={t("description")} />
      <ExpenseView
        expense={expense.data}
        permissions={context.permissions}
        userId={context.userId}
        strict={context.strict}
        cashAccounts={context.cashAccounts}
        today={storeDay()}
        windowDays={context.windowDays}
        canBackdate={context.permissions.includes("backdate.approve")}
      />
    </>
  );
}
