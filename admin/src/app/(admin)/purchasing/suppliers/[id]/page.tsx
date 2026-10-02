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
import type { PurchaseInvoice, StatementLine, SupplierCredit } from "@/lib/purchasing";
import type { RawSearchParams } from "@/lib/table-params";
import { SupplierDetail } from "./supplier-detail";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("suppliers") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One supplier: details, its opening balance, its statement with running
 * balances in the supplier's currency and in IQD (as of a date), its open
 * invoices and its credits, which can be applied to an invoice later.
 */
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const raw = await searchParams;
  const asOf = typeof raw.as_of === "string" && DAY.test(raw.as_of) ? raw.as_of : undefined;
  const currencyFilter = raw.currency === "IQD" || raw.currency === "USD" ? raw.currency : undefined;
  const t = await getTranslations("purchasing.supplier");
  const api = await serverApi();
  const [supplier, permissions] = await Promise.all([
    load(api.GET("/admin/suppliers/{id}", { params: { path: { id } } })),
    loadPermissions(api),
  ]);
  if (!supplier.ok) {
    if (supplier.error.status === 404) notFound();
    return <PageError error={supplier.error} />;
  }
  const [statement, credits, invoices, windowDays] = await Promise.all([
    load(
      api.GET("/admin/suppliers/{id}/statement", {
        params: { path: { id }, query: { ...(asOf ? { as_of: asOf } : {}), ...(currencyFilter ? { currency: currencyFilter } : {}) } },
      }),
    ),
    load(api.GET("/admin/supplier-credits", { params: { query: { supplier_id: id, per_page: 100 } } })),
    load(api.GET("/admin/purchase-invoices", { params: { query: { supplier_id: id, per_page: 100 } } })),
    loadBackdatingWindow(api),
  ]);

  return (
    <>
      <Link href="/purchasing/suppliers" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={<span data-testid="supplier-title">{supplier.data.name}</span>} description={t("description")} />
      <SupplierDetail
        supplier={supplier.data}
        statement={statement.ok ? (statement.data as unknown as StatementLine[]) : null}
        credits={credits.ok ? (asList(credits.data) as SupplierCredit[]) : []}
        invoices={invoices.ok ? (invoices.data.data as unknown as PurchaseInvoice[]) : []}
        filters={{ asOf: asOf ?? "", currency: currencyFilter ?? "" }}
        permissions={permissions}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}

/** Supplier credits answer a bare array or a page (the contract leaves it open). */
function asList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const data = (body as { data?: unknown[] } | null)?.data;
  return Array.isArray(data) ? data : [];
}
