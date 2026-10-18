import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { CategoriesView } from "./categories-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("expenseCategories") };
}

/**
 * Expense categories (expense_categories.manage to change them, expenses.read
 * to see them): each maps to an expense account in the ledger. A category is
 * never deleted here — one that was used stays in the books — only renamed or
 * deactivated, so it can't be chosen for new expenses.
 */
export default async function ExpenseCategoriesPage() {
  const t = await getTranslations("expenses.categories");
  const api = await serverApi();
  const [categories, permissions] = await Promise.all([load(api.GET("/admin/expense-categories")), loadPermissions(api)]);
  if (!categories.ok) return <PageError error={categories.error} />;

  return (
    <>
      <Link href="/expenses" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <CategoriesView categories={categories.data} canManage={permissions.includes("expense_categories.manage")} />
    </>
  );
}
