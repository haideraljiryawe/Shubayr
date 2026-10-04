import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { PARTY_FILTER_KEYS, partyListQuery } from "@/lib/delivery-parties";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { PartiesView } from "./parties-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("parties");
  return { title: t("title") };
}

/**
 * Every delivery party (contract 11.2): internal agents and external
 * drivers, searched, filtered and paged by the server. External drivers are
 * created and edited here (drivers.manage); a party's custody is on its own
 * page (deliveries.manage).
 */
export default async function DeliveryPartiesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("parties");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["name"],
    defaultSort: "name",
    filterKeys: PARTY_FILTER_KEYS,
  });
  const api = await serverApi();
  const [first, permissions] = await Promise.all([
    load(api.GET("/admin/delivery-parties", { params: { query: partyListQuery(params) } })),
    loadPermissions(api),
  ]);
  let page = first;
  if (page.ok && page.data.data.length === 0 && page.data.total > 0 && params.page > 1) {
    page = await load(
      api.GET("/admin/delivery-parties", { params: { query: partyListQuery({ ...params, page: lastPage(page.data.total, params.perPage) }) } }),
    );
  }
  if (!page.ok) return <PageError error={page.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PartiesView
        rows={page.data.data}
        state={{ page: page.data.page, perPage: page.data.per_page, total: page.data.total, sort: "name", dir: "asc" }}
        canManageDrivers={permissions.includes("drivers.manage")}
        canViewCustody={permissions.includes("deliveries.manage")}
      />
    </>
  );
}
