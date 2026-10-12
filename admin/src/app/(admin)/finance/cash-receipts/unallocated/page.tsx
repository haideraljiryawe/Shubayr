import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadReceiptFilterOptions, loadReceiptPage } from "@/lib/api/cash-receipts-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { serverApi } from "@/lib/api/server";
import { UNALLOCATED_FILTER_KEYS } from "@/lib/finance/cash-receipts";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { ReceiptsTabs, ReceiptsView } from "../receipts-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cashReceipts.tabs");
  return { title: t("unallocated") };
}

/**
 * Active receipts with something still unallocated (deliveries.manage):
 * received before the orders were known, or only partly allocated. Each
 * opens at its allocation step (cash_receipts.allocate).
 */
export default async function UnallocatedReceiptsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("cashReceipts.list");
  const params = parseTableParams(await searchParams, { sortKeys: ["document_date"], defaultSort: "document_date", filterKeys: UNALLOCATED_FILTER_KEYS });
  const api = await serverApi();
  const [{ result, ignoredDates }, options, permissions] = await Promise.all([
    loadReceiptPage(api, "unallocated", params),
    loadReceiptFilterOptions(api, params.filters.party_id),
    loadPermissions(api),
  ]);
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("unallocatedDescription")} />
      <ReceiptsTabs active="unallocated" />
      <ReceiptsView
        mode="unallocated"
        rows={result.data.data}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: "document_date", dir: "asc" }}
        party={options.party}
        accounts={options.accounts}
        ignoredDates={ignoredDates}
        canAllocate={permissions.includes("cash_receipts.allocate")}
      />
    </>
  );
}
