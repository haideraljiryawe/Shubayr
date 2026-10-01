import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { CategoriesView } from "./categories-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("categories") };
}

/**
 * Departments and subcategories (catalog.categories). The whole tree, hidden
 * nodes included, comes in one read. Converting a category to a brand also
 * needs catalog.brands, so it is offered only to those who hold both — the
 * API decides either way.
 */
export default async function CategoriesPage() {
  const t = await getTranslations("categories");
  const api = await serverApi();
  const [tree, me] = await Promise.all([
    load(api.GET("/admin/categories")),
    load(api.GET("/me")),
  ]);
  if (!tree.ok) return <PageError error={tree.error} />;
  const permissions = me.ok ? (me.data.permissions ?? []) : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CategoriesView
        tree={tree.data}
        canConvert={permissions.includes("catalog.brands")}
      />
    </>
  );
}
