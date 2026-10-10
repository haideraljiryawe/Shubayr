import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPartyChoice } from "@/lib/api/parties-server";
import { load, serverApi } from "@/lib/api/server";
import { EXCEPTION_FILTER_KEYS, exceptionListQuery } from "@/lib/finance/custody-exceptions";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { ExceptionsView } from "./exceptions-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("custodyExceptions") };
}

/**
 * Custody exceptions (custody_exceptions.view, contract 13.3): lost or
 * damaged goods, returns at the door and delivery-fee refunds, filtered by
 * type, party, order, date and status and paged by the server. They are
 * recorded from an order (its party's custody, or its delivery).
 */
export default async function CustodyExceptionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("custodyExceptions.list");
  const params = parseTableParams(await searchParams, { sortKeys: ["document_date"], defaultSort: "document_date", filterKeys: EXCEPTION_FILTER_KEYS });
  const api = await serverApi();
  const { query, ignoredDates } = exceptionListQuery(params.filters, params.page, params.perPage);
  const fetchPage = (page: number) => load(api.GET("/admin/custody-exceptions", { params: { query: { ...query, page } } }));
  const [first, party] = await Promise.all([fetchPage(params.page), loadPartyChoice(api, params.filters.party_id)]);
  let result = first;
  if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
    result = await fetchPage(lastPage(result.data.total, params.perPage));
  }
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ExceptionsView
        rows={result.data.data}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: "document_date", dir: "desc" }}
        party={party}
        orderFilter={"order_id" in query ? (query.order_id ?? null) : null}
        ignoredDates={ignoredDates}
      />
    </>
  );
}
