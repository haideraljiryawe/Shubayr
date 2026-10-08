import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadCashAccounts } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { ReceiveScreen } from "./receive-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cashReceipts.receive");
  return { title: t("title") };
}

/**
 * Receive cash from a delivery party (cash_receipts.receive, contract 13.2):
 * the party's cash held and unsettled collections, oldest first, the amount
 * handed in and the cash account it goes into, and — with
 * cash_receipts.allocate — which orders it settles, the rest kept
 * unallocated. The party comes from the URL, so the page can be linked from
 * the party's own page and re-reads after each receipt.
 */
export default async function ReceiveCashPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("cashReceipts.receive");
  const raw = await searchParams;
  const partyId = typeof raw.party_id === "string" && UUID.test(raw.party_id) ? raw.party_id : "";
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  if (!permissions.includes("cash_receipts.receive")) {
    return <PageError error={new ApiError(403, "cash_receipts.receive required")} />;
  }
  const canAllocate = permissions.includes("cash_receipts.allocate");
  const [parties, cashAccounts, windowDays, custody, suggestions] = await Promise.all([
    // Active parties, the ones holding the most cash first.
    load(api.GET("/admin/delivery-parties/custody-overview", { params: { query: { active: true, sort_by: "cash_held", sort_direction: "desc", per_page: 100 } } })),
    loadCashAccounts(api),
    loadBackdatingWindow(api),
    partyId ? load(api.GET("/admin/delivery-parties/{id}/custody", { params: { path: { id: partyId } } })) : null,
    partyId && canAllocate
      ? load(api.GET("/admin/cash-receipts/allocation-suggestions", { params: { query: { party_id: partyId, per_page: 100 } } }))
      : null,
  ]);
  if (!parties.ok) return <PageError error={parties.error} />;
  if (custody && !custody.ok) return <PageError error={custody.error} />;
  if (suggestions && !suggestions.ok) return <PageError error={suggestions.error} />;

  const options = parties.data.data.map((party) => ({ id: party.id, name: party.name, phone: party.phone, cashHeld: party.custody_summary.cash_held }));
  // A party from the URL beyond the first 100 (or inactive) is still named.
  if (custody?.ok && !options.some((option) => option.id === partyId)) {
    const party = custody.data.party;
    options.push({ id: party.id, name: party.name, phone: party.phone, cashHeld: custody.data.cash.amount });
  }

  return (
    <>
      <Link href="/finance/cash-receipts" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <ReceiveScreen
        key={partyId || "none"}
        parties={options}
        partyId={partyId}
        party={custody?.ok ? custody.data.party : null}
        cashHeld={custody?.ok ? custody.data.cash.amount : null}
        suggestions={suggestions?.ok ? suggestions.data.data : null}
        cashAccounts={cashAccounts === null ? null : cashAccounts.filter((account) => account.currency_code === "IQD" && account.is_active)}
        canAllocate={canAllocate}
        canBackdate={permissions.includes("backdate.approve")}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
