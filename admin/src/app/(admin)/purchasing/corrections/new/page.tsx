import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadInvoice } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { toMilli, UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { CorrectionForm, type LotFacts } from "./correction-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("purchasing.correction");
  return { title: t("title") };
}

/**
 * A late landed cost or a cost correction on a posted invoice
 * (purchases.correct). The split preview needs each line's lot as it is now
 * — in warehouse stock, out in custody, returned to the supplier — which is
 * read with inventory.view; without it the split is shown after posting.
 */
export default async function NewCorrectionPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const invoiceId = typeof raw.invoice_id === "string" && UUID.test(raw.invoice_id) ? raw.invoice_id : null;
  if (!invoiceId) notFound();
  const t = await getTranslations("purchasing.correction");
  const api = await serverApi();
  const [invoice, permissions, windowDays] = await Promise.all([loadInvoice(api, invoiceId), loadPermissions(api), loadBackdatingWindow(api)]);
  if (!permissions.includes("purchases.correct")) return <PageError error={new ApiError(403, "purchases.correct required")} />;
  if (!invoice.ok) {
    if (invoice.error.status === 404) notFound();
    return <PageError error={invoice.error} />;
  }
  const facts = permissions.includes("inventory.view") ? await lotFacts(api, invoice.data.items ?? []) : null;

  return (
    <>
      <Link href={`/purchasing/invoices/${invoiceId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {invoice.data.document_number}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <CorrectionForm invoice={invoice.data} facts={facts} permissions={permissions} today={storeDay()} windowDays={windowDays} />
    </>
  );
}

/** Each purchase line's lot as it stands now, for the split preview. */
async function lotFacts(
  api: Awaited<ReturnType<typeof serverApi>>,
  items: Array<{ id: string; lot_id: string | null }>,
): Promise<Record<string, LotFacts>> {
  const entries = await Promise.all(
    items.map(async (item) => {
      if (!item.lot_id) return null;
      const [lot, movements] = await Promise.all([
        load(api.GET("/admin/inventory/lots/{id}", { params: { path: { id: item.lot_id } } })),
        load(api.GET("/admin/inventory/movements", { params: { query: { batch_id: item.lot_id, per_page: 100 } } })),
      ]);
      if (!lot.ok || !movements.ok) return null;
      const warehouse = (lot.data.batch_stock ?? []).reduce((sum, row) => sum + toMilli(row.quantity), 0);
      // Returns to the supplier are movements of their own type, which the
      // contract's movement enum does not list yet; they are read as sent.
      const returned = movements.data.data
        .filter((row) => (row.type as string) === "return_to_supplier")
        .reduce((sum, row) => sum + toMilli(row.quantity), 0);
      const facts: LotFacts = {
        warehouse: String(warehouse / 1000),
        custody: String(toMilli(lot.data.custody ?? 0) / 1000),
        returned: String(returned / 1000),
        complete: movements.data.total <= movements.data.data.length,
      };
      return [item.id, facts] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}
