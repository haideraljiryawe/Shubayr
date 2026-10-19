import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadCashAccounts, loadSupplierOptions } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID, type LocationInfo } from "@/lib/inventory";
import { lastCostOf, newestLot, recentSupplierIds, restockLocation, type InvoiceItemFacts, type LotFacts } from "@/lib/restock";
import type { RawSearchParams } from "@/lib/table-params";
import { InvoiceForm, type RestockPrefill } from "./invoice-form";

export async function generateMetadata({ searchParams }: { searchParams: Promise<RawSearchParams> }): Promise<Metadata> {
  const t = await getTranslations("purchasing.invoice");
  const restock = typeof (await searchParams).restock === "string";
  return { title: restock ? t("restock.title") : t("newTitle") };
}

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * The purchase invoice — one screen, one posting (purchases.create): the
 * supplier's document, its lines in packs or base units, landed costs and
 * their allocation, then "Save and add to stock". The draft is saved to the
 * caller's own account as it is typed.
 *
 * `?restock=<product id>` is Restock (إعادة تعبئة المخزون): the same form,
 * with one line per variant of that product, each starting at its last cost,
 * the location its newest stock went to, the supplier it was last bought
 * from, and today's business date. Lines left at 0 are not posted.
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.invoice");
  const raw = await searchParams;
  const api = await serverApi();
  const preset = typeof raw.supplier_id === "string" && UUID.test(raw.supplier_id) ? raw.supplier_id : "";
  const restockId = typeof raw.restock === "string" && UUID.test(raw.restock) ? raw.restock : null;
  const [permissions, { suppliers, complete }, { locations }, windowDays, recent] = await Promise.all([
    loadPermissions(api),
    loadSupplierOptions(api, preset || undefined),
    loadWarehouses(api),
    loadBackdatingWindow(api),
    load(api.GET("/admin/purchase-invoices", { params: { query: { per_page: 30 } } })),
  ]);
  if (!permissions.includes("purchases.create")) return <PageError error={new ApiError(403, "purchases.create required")} />;
  const active = [...locations.values()].filter((info) => info.active);
  const restock = restockId ? await loadRestock(api, restockId, active, permissions) : null;
  if (restockId && !restock) return <PageError error={new ApiError(404, "Product not found")} />;
  // "Paid now" settles the invoice from a cash account right after posting:
  // the existing supplier payment, so it needs that permission, the accounts
  // and the invoice's amount (cost.view).
  const canPayNow = ["supplier_payments.record", "cash_accounts.view", "cost.view"].every((key) => permissions.includes(key));
  const cashAccounts = canPayNow ? await loadCashAccounts(api) : null;
  const backHref = restock ? `/catalog/products/${restock.productId}` : "/purchasing/invoices";

  return (
    <>
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {restock ? t("restock.backToProduct") : t("back")}
      </Link>
      <PageHeader
        title={restock ? t("restock.titleFor", { name: restock.productName }) : t("newTitle")}
        description={restock ? t("restock.description") : t("newDescription")}
      />
      <InvoiceForm
        suppliers={suppliers.filter((supplier) => supplier.is_active)}
        suppliersComplete={complete}
        locations={active}
        presetSupplierId={preset}
        today={storeDay()}
        windowDays={windowDays}
        permissions={permissions}
        restock={restock}
        recentSupplierIds={recent.ok ? recentSupplierIds(recent.data.data) : []}
        cashAccounts={cashAccounts}
      />
    </>
  );
}

/** One line per variant of the product, with what the store last did for it. */
async function loadRestock(api: Api, productId: string, locations: LocationInfo[], permissions: string[]): Promise<RestockPrefill | null> {
  const product = await load(api.GET("/admin/products/{id}", { params: { path: { id: productId } } }));
  if (!product.ok) return null;
  const locale = await getLocale();
  const name = (locale === "ar" ? product.data.name_ar : product.data.name_en) || product.data.name_ar || product.data.name_en || "";
  const variants = (product.data.variants ?? []).filter((variant) => variant.id);
  const canLots = permissions.includes("inventory.view");
  const canCost = permissions.includes("cost.view");

  // The newest lot of each SKU (a page of 100 lots each).
  const newest = new Map<string, LotFacts | null>();
  if (canLots) {
    await Promise.all(
      variants.map(async (variant) => {
        const page = await load(api.GET("/admin/inventory/lots", { params: { query: { variant_id: variant.id!, per_page: 100 } } }));
        newest.set(variant.id!, page.ok ? newestLot(page.data.data as unknown as LotFacts[]) : null);
      }),
    );
  }

  // The invoices those lots came from, read once each, for the supplier's unit cost.
  const items: InvoiceItemFacts[] = [];
  if (canCost) {
    const invoiceIds = [...new Set([...newest.values()].flatMap((lot) => (lot?.source_type === "purchase_invoice" && lot.source_id ? [lot.source_id] : [])))];
    const invoices = await Promise.all(invoiceIds.map((id) => load(api.GET("/admin/purchase-invoices/{id}", { params: { path: { id } } }))));
    for (const invoice of invoices) if (invoice.ok) items.push(...((invoice.data.items ?? []) as unknown as InvoiceItemFacts[]));
  }

  const latest = newestLot([...newest.values()].filter((lot): lot is LotFacts => lot !== null));
  return {
    productId,
    productName: name,
    supplierId: latest?.supplier_id ?? "",
    locationId: restockLocation(latest, locations),
    lines: variants.map((variant) => ({
      sku: {
        variantId: variant.id!,
        productId,
        sku: variant.sku ?? "",
        productName: name,
        baseUnit: variant.base_unit ?? "piece",
        wholeUnitsOnly: variant.whole_units_only ?? true,
        tracksExpiry: product.data.tracks_expiry ?? false,
      },
      lastCost: canCost ? lastCostOf(newest.get(variant.id!) ?? null, items) : null,
    })),
  };
}
