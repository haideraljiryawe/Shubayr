import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadDocument, loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { lineKey, UUID, type Balance, type Count } from "@/lib/inventory";
import { CountView, type ScopeRow } from "./count-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("documents.count") };
}

const SCOPE_PAGES = 10;

/**
 * One physical count. A draft is where counted quantities are entered and
 * the differences reviewed before approval (inventory.adjust); an approved
 * count shows what was posted.
 *
 * Count lines carry ids only, so the page reads the scope's current
 * balances once (a page of 100 at a time) to name each line's SKU and lot
 * and to show what is reserved on it now.
 */
export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("inventory");
  const api = await serverApi();
  const [count, permissions, { locations }] = await Promise.all([
    loadDocument(api, "count", id),
    loadPermissions(api),
    loadWarehouses(api),
  ]);
  if (!count.ok) {
    if (count.error.status === 404) notFound();
    return <PageError error={count.error} />;
  }
  const doc = count.data as Count;

  const scope = {
    ...(doc.warehouse_id ? { warehouse_id: doc.warehouse_id } : {}),
    ...(doc.location_id ? { location_id: doc.location_id } : {}),
    ...(doc.variant_id ? { variant_id: doc.variant_id } : {}),
  };
  const rows: Balance[] = [];
  for (let page = 1; page <= SCOPE_PAGES; page += 1) {
    const result = await load(api.GET("/admin/inventory/balances", { params: { query: { ...scope, page, per_page: 100 } } }));
    if (!result.ok) break;
    rows.push(...result.data.data);
    if (rows.length >= result.data.total || result.data.data.length === 0) break;
  }
  const byLine: Record<string, ScopeRow> = {};
  for (const row of rows) {
    byLine[lineKey(row)] = { sku: row.sku, lotNumber: row.lot_number, reserved: row.reserved, quantity: row.quantity, expiry: row.expiry_date };
  }

  return (
    <>
      <Link href="/inventory/counts" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("documents.count")}
      </Link>
      <PageHeader
        title={<span dir="ltr" data-testid="document-number">{doc.document_number}</span>}
        description={doc.status === "draft" ? t("count.draftDescription") : t("count.approvedDescription")}
      />
      <CountView
        // A fresh read (after approval or a re-snapshot) starts the view over.
        key={`${doc.id}:${doc.status}`}
        count={doc}
        rows={byLine}
        locations={Object.fromEntries(locations)}
        canApprove={permissions.includes("inventory.adjust")}
        canRecount={permissions.includes("inventory.count")}
        canViewLedger={permissions.includes("ledger.view")}
      />
    </>
  );
}
