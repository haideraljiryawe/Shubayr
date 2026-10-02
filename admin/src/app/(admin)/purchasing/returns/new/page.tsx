import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadInvoice } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID, type Balance } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { ReturnForm } from "./return-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("purchasing.return");
  return { title: t("title") };
}

/**
 * Return goods to the supplier from the exact lots an invoice created
 * (supplier_returns.create). Only unreserved stock can go back; it is valued
 * at the lot's cost and reduces what is owed, any excess becoming a credit.
 */
export default async function NewReturnPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const invoiceId = typeof raw.invoice_id === "string" && UUID.test(raw.invoice_id) ? raw.invoice_id : null;
  if (!invoiceId) notFound();
  const t = await getTranslations("purchasing.return");
  const api = await serverApi();
  const [invoice, permissions, { locations }, windowDays] = await Promise.all([
    loadInvoice(api, invoiceId),
    loadPermissions(api),
    loadWarehouses(api),
    loadBackdatingWindow(api),
  ]);
  if (!permissions.includes("supplier_returns.create")) return <PageError error={new ApiError(403, "supplier_returns.create required")} />;
  if (!invoice.ok) {
    if (invoice.error.status === 404) notFound();
    return <PageError error={invoice.error} />;
  }
  const items = invoice.data.items ?? [];
  const balances = await Promise.all(
    items.map(async (item) => {
      if (!item.lot_id) return [item.id, [] as Balance[]] as const;
      const page = await load(api.GET("/admin/inventory/balances", { params: { query: { batch_id: item.lot_id, per_page: 100 } } }));
      return [item.id, page.ok ? page.data.data : null] as const;
    }),
  );
  const supplierBalances = await load(api.GET("/admin/suppliers/balances"));
  const balance = supplierBalances.ok
    ? supplierBalances.data.find((row) => row.supplier.id === invoice.data.supplier_id && row.currency_code === invoice.data.currency_code)
    : undefined;

  return (
    <>
      <Link href={`/purchasing/invoices/${invoiceId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {invoice.data.document_number}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <ReturnForm
        invoice={invoice.data}
        balances={Object.fromEntries(balances)}
        locations={Object.fromEntries(locations)}
        supplierBalance={balance ? String(balance.balance_currency) : null}
        permissions={permissions}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
