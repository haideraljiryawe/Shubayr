import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { CUSTODY_SORT_KEYS, PARTY_FILTER_KEYS, partyListQuery } from "@/lib/delivery-parties";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { PartiesTabs } from "../parties-tabs";
import { CustodyView } from "./custody-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("parties.custodyOverview");
  return { title: t("title") };
}

/**
 * What every party holds right now (deliveries.manage): cash held for the
 * store, the orders whose goods they carry and the age of the oldest item,
 * from GET /admin/delivery-parties/custody-overview, sorted and paged by the
 * server. The goods value (and sorting by it) needs cost.view.
 */
export default async function CustodyOverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("parties.custodyOverview");
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  const canViewCost = permissions.includes("cost.view");
  const sortKeys = canViewCost ? CUSTODY_SORT_KEYS : CUSTODY_SORT_KEYS.filter((key) => key !== "goods_value_iqd");
  const params = parseTableParams(await searchParams, { sortKeys, defaultSort: "cash_held", defaultDir: "desc", filterKeys: PARTY_FILTER_KEYS });
  const query = (page: number) => ({ ...partyListQuery({ ...params, page }), sort_by: params.sort, sort_direction: params.dir });
  let result = await load(api.GET("/admin/delivery-parties/custody-overview", { params: { query: query(params.page) } }));
  if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
    result = await load(api.GET("/admin/delivery-parties/custody-overview", { params: { query: query(lastPage(result.data.total, params.perPage)) } }));
  }
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PartiesTabs active="custody" />
      <CustodyView
        rows={result.data.data}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: params.sort, dir: params.dir }}
        canViewCost={canViewCost}
        canReceive={permissions.includes("cash_receipts.receive")}
      />
    </>
  );
}
