import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadPartyChoice } from "@/lib/api/parties-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { TRIP_FILTER_KEYS, tripListQuery } from "@/lib/trips";
import { TripsView } from "./trips-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("trips") };
}

/**
 * External-driver trips (trips.view, contract 13.4): one driver, one fare and
 * the orders handed over to them, filtered by driver, status and date and
 * paged by the server. New trips need trips.manage.
 */
export default async function TripsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("trips.list");
  const params = parseTableParams(await searchParams, { sortKeys: ["document_date"], defaultSort: "document_date", filterKeys: TRIP_FILTER_KEYS });
  const api = await serverApi();
  const { query, ignoredDates } = tripListQuery(params.filters, params.page, params.perPage);
  const fetchPage = (page: number) => load(api.GET("/admin/external-driver-trips", { params: { query: { ...query, page } } }));
  const [first, driver, permissions] = await Promise.all([fetchPage(params.page), loadPartyChoice(api, params.filters.driver_party_id), loadPermissions(api)]);
  let result = first;
  if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
    result = await fetchPage(lastPage(result.data.total, params.perPage));
  }
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          permissions.includes("trips.manage") ? (
            <Link href="/deliveries/trips/new" className={buttonClasses()} data-testid="trips-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <TripsView
        rows={result.data.data}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: "document_date", dir: "desc" }}
        driver={driver}
        ignoredDates={ignoredDates}
      />
    </>
  );
}
