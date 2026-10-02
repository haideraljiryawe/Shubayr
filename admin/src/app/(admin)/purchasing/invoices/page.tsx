import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadSupplierOptions } from "@/lib/api/purchasing-server";
import { load, serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { UUID } from "@/lib/inventory";
import type { PurchaseInvoice } from "@/lib/purchasing";
import { parseTableParams, type RawSearchParams, type TableParams } from "@/lib/table-params";
import { InvoicesTable } from "./invoices-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("purchasing") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function invoiceQuery(params: TableParams, page: number) {
  const f = params.filters;
  return {
    page,
    per_page: params.perPage,
    ...(f.supplier_id && UUID.test(f.supplier_id) ? { supplier_id: f.supplier_id } : {}),
    ...(f.currency === "IQD" || f.currency === "USD" ? { currency: f.currency as "IQD" | "USD" } : {}),
    ...(f.from && DAY.test(f.from) ? { from: f.from } : {}),
    ...(f.to && DAY.test(f.to) ? { to: f.to } : {}),
  };
}

/** Posted purchase invoices (suppliers.view), filtered and paged by the server. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.invoices");
  const params = parseTableParams(await searchParams, {
    sortKeys: ["document_date"],
    defaultSort: "document_date",
    defaultDir: "desc",
    filterKeys: ["supplier_id", "currency", "from", "to"],
  });
  const api = await serverApi();
  const [first, permissions, options] = await Promise.all([
    load(api.GET("/admin/purchase-invoices", { params: { query: invoiceQuery(params, params.page) } })),
    loadPermissions(api),
    loadSupplierOptions(api),
  ]);
  let invoices = first;
  if (invoices.ok && invoices.data.data.length === 0 && invoices.data.total > 0 && params.page > 1) {
    invoices = await load(api.GET("/admin/purchase-invoices", { params: { query: invoiceQuery(params, lastPage(invoices.data.total, params.perPage)) } }));
  }
  if (!invoices.ok) return <PageError error={invoices.error} />;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          permissions.includes("purchases.create") ? (
            <Link href="/purchasing/invoices/new" className={buttonClasses()} data-testid="invoice-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <InvoicesTable
        rows={invoices.data.data as unknown as PurchaseInvoice[]}
        state={{ page: invoices.data.page, perPage: invoices.data.per_page, total: invoices.data.total, sort: "document_date", dir: "desc" }}
        suppliers={options.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        canViewCost={permissions.includes("cost.view")}
      />
    </>
  );
}
