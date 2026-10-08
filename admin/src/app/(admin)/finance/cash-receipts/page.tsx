import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadReceiptFilterOptions, loadReceiptPage } from "@/lib/api/cash-receipts-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { serverApi } from "@/lib/api/server";
import { RECEIPT_FILTER_KEYS } from "@/lib/finance/cash-receipts";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { ReceiptsTabs, ReceiptsView } from "./receipts-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("cashReceipts") };
}

/**
 * Cash receipt vouchers (deliveries.manage, contract 13.2): cash handed in
 * by delivery parties, filtered by party, cash account, date and status, and
 * paged by the server. Receiving cash needs cash_receipts.receive.
 */
export default async function CashReceiptsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("cashReceipts.list");
  const params = parseTableParams(await searchParams, { sortKeys: ["document_date"], defaultSort: "document_date", filterKeys: RECEIPT_FILTER_KEYS });
  const api = await serverApi();
  const [{ result, ignoredDates }, options, permissions] = await Promise.all([
    loadReceiptPage(api, "vouchers", params),
    loadReceiptFilterOptions(api),
    loadPermissions(api),
  ]);
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          permissions.includes("cash_receipts.receive") ? (
            <Link href="/finance/cash-receipts/new" className={buttonClasses()} data-testid="receipts-receive">
              <Plus className="size-4" aria-hidden />
              {t("receive")}
            </Link>
          ) : null
        }
      />
      <ReceiptsTabs active="vouchers" />
      <ReceiptsView
        mode="vouchers"
        rows={result.data.data}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: "document_date", dir: "desc" }}
        parties={options.parties}
        accounts={options.accounts}
        ignoredDates={ignoredDates}
        canAllocate={permissions.includes("cash_receipts.allocate")}
      />
    </>
  );
}
