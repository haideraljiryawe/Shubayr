import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { SuppliersView } from "./suppliers-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("suppliers") };
}

/**
 * Suppliers (suppliers.view), paged by the server; create, edit, deactivate
 * and reactivate with suppliers.manage. Deactivating keeps the history.
 */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.suppliers");
  const params = parseTableParams(await searchParams, { sortKeys: ["name"], defaultSort: "name" });
  const api = await serverApi();
  const query = (page: number) => ({ page, per_page: params.perPage });
  const [first, permissions] = await Promise.all([
    load(api.GET("/admin/suppliers", { params: { query: query(params.page) } })),
    loadPermissions(api),
  ]);
  let suppliers = first;
  if (suppliers.ok && suppliers.data.data.length === 0 && suppliers.data.total > 0 && params.page > 1) {
    suppliers = await load(api.GET("/admin/suppliers", { params: { query: query(lastPage(suppliers.data.total, params.perPage)) } }));
  }
  if (!suppliers.ok) return <PageError error={suppliers.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SuppliersView
        rows={suppliers.data.data}
        state={{ page: suppliers.data.page, perPage: suppliers.data.per_page, total: suppliers.data.total, sort: "name", dir: "asc" }}
        canManage={permissions.includes("suppliers.manage")}
      />
    </>
  );
}
