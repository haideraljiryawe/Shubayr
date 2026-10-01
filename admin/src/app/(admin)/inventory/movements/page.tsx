import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { MovementsTable } from "@/components/inventory/movements-table";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { MOVEMENT_FILTER_KEYS, movementQuery } from "@/lib/inventory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("movements") };
}

/** Every stock movement, newest first (inventory.view; costs with cost.view). */
export default async function MovementsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("inventory.movements");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["created_at"],
    defaultSort: "created_at",
    defaultDir: "desc",
    filterKeys: MOVEMENT_FILTER_KEYS,
  });
  const api = await serverApi();
  const [first, permissions, { locations }] = await Promise.all([
    load(api.GET("/admin/inventory/movements", { params: { query: movementQuery(params) } })),
    loadPermissions(api),
    loadWarehouses(api),
  ]);
  let movements = first;
  if (movements.ok && movements.data.data.length === 0 && movements.data.total > 0 && params.page > 1) {
    movements = await load(
      api.GET("/admin/inventory/movements", { params: { query: movementQuery(params, lastPage(movements.data.total, params.perPage)) } }),
    );
  }
  if (!movements.ok) return <PageError error={movements.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <MovementsTable
        rows={movements.data.data}
        state={{ page: movements.data.page, perPage: movements.data.per_page, total: movements.data.total, sort: "created_at", dir: "desc" }}
        locations={Object.fromEntries(locations)}
        filters={params.filters}
        canViewCost={permissions.includes("cost.view")}
      />
    </>
  );
}
