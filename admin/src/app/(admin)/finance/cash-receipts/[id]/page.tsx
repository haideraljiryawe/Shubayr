import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadBackdatingWindow } from "@/lib/api/purchasing-server";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import { toFixed } from "@/lib/purchasing";
import { ReceiptView } from "./receipt-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cashReceipts.detail");
  return { title: t("title") };
}

/**
 * One cash receipt voucher (deliveries.manage): what was received, from whom
 * and into which account; every allocation batch with its orders; and the
 * reversal, if any. With cash_receipts.allocate an active receipt's remainder
 * is allocated here; with cash_receipts.reverse it is reversed here.
 */
export default async function CashReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("cashReceipts.detail");
  const api = await serverApi();
  const [receipt, permissions, windowDays] = await Promise.all([
    load(api.GET("/admin/cash-receipts/{id}", { params: { path: { id } } })),
    loadPermissions(api),
    loadBackdatingWindow(api),
  ]);
  if (!receipt.ok) {
    if (receipt.error.status === 404) notFound();
    return <PageError error={receipt.error} />;
  }
  const voucher = receipt.data;
  const canAllocate =
    permissions.includes("cash_receipts.allocate") && voucher.status === "active" && toFixed(voucher.unallocated_amount_iqd) > 0n;
  const suggestions = canAllocate
    ? await load(api.GET("/admin/cash-receipts/allocation-suggestions", { params: { query: { party_id: voucher.party_id, per_page: 100 } } }))
    : null;
  if (suggestions && !suggestions.ok) return <PageError error={suggestions.error} />;

  return (
    <>
      <Link href="/finance/cash-receipts" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={<span dir="ltr" data-testid="receipt-number">{voucher.document_number}</span>}
        description={t("description")}
      />
      <ReceiptView
        receipt={voucher}
        suggestions={suggestions?.ok ? suggestions.data.data : null}
        canReverse={permissions.includes("cash_receipts.reverse") && voucher.status === "active"}
        canViewLedger={permissions.includes("ledger.view")}
        canBackdate={permissions.includes("backdate.approve")}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
