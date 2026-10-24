import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadCashAccounts, loadRecentSuppliers } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID, type LocationInfo } from "@/lib/inventory";
import { lastSupplierId, newestLot, restockCost, restockLocation, type LastPurchase, type LotFacts } from "@/lib/restock";
import type { RawSearchParams } from "@/lib/table-params";
import { InvoiceForm, type RestockPrefill } from "./invoice-form";
import { variantAttributes } from "@/lib/invoice-entry";

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
 *
 * "Paid now" posts the invoice and pays it in one atomic call
 * (POST /admin/purchase-invoices/paid-now), so it needs both purchases.create
 * and supplier_payments.record, plus the cash accounts to pay from.
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.invoice");
  const raw = await searchParams;
  const api = await serverApi();
  const preset = typeof raw.supplier_id === "string" && UUID.test(raw.supplier_id) ? raw.supplier_id : "";
  const restockId = typeof raw.restock === "string" && UUID.test(raw.restock) ? raw.restock : null;
  const [permissions, { locations }, windowDays] = await Promise.all([loadPermissions(api), loadWarehouses(api), loadBackdatingWindow(api)]);
  if (!permissions.includes("purchases.create")) return <PageError error={new ApiError(403, "purchases.create required")} />;
  const active = [...locations.values()].filter((info) => info.active);
  const restock = restockId ? await loadRestock(api, restockId, active, permissions) : null;
  if (restockId && !restock) return <PageError error={new ApiError(404, "Product not found")} />;
  const suppliers = await loadRecentSuppliers(api, preset || restock?.supplierId || undefined);
  // "Paid now" is one atomic invoice + payment (purchases.create and
  // supplier_payments.record), paid from a cash account the person can see.
  const canPayNow = ["supplier_payments.record", "cash_accounts.view"].every((key) => permissions.includes(key));
  const cashAccounts = canPayNow ? await loadCashAccounts(api) : null;
  const backHref = restock ? `/catalog/products/${restock.productId}` : "/purchasing/invoices";

  return (
    <>
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-label text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {restock ? t("restock.backToProduct") : t("back")}
      </Link>
      <PageHeader
        title={restock ? t("restock.titleFor", { name: restock.productName }) : t("newTitle")}
        description={restock ? t("restock.description") : t("newDescription")}
      />
      <InvoiceForm
        suppliers={suppliers}
        locations={active}
        presetSupplierId={preset}
        today={storeDay()}
        windowDays={windowDays}
        permissions={permissions}
        restock={restock}
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

  // The newest lot of each SKU, read newest-first from the API (one row each).
  const newest = new Map<string, LotFacts | null>();
  if (canLots) {
    await Promise.all(
      variants.map(async (variant) => {
        const page = await load(
          api.GET("/admin/inventory/lots", {
            params: { query: { variant_id: variant.id!, sort_by: "entry_date", sort_direction: "desc", per_page: 1 } },
          }),
        );
        newest.set(variant.id!, page.ok ? ((page.data.data[0] as unknown as LotFacts | undefined) ?? null) : null);
      }),
    );
  }

  // The latest posted purchase cost of each SKU (cost.view): unit cost, currency and supplier.
  const last = new Map<string, LastPurchase | null>();
  if (canCost) {
    await Promise.all(
      variants.map(async (variant) => {
        const result = await load(api.GET("/admin/purchase-costs/variants/{id}/last", { params: { path: { id: variant.id! } } }));
        last.set(variant.id!, result.ok ? ((result.data as LastPurchase | null) ?? null) : null);
      }),
    );
  }

  const latest = newestLot([...newest.values()].filter((lot): lot is LotFacts => lot !== null));
  return {
    productId,
    productName: name,
    supplierId: lastSupplierId([...last.values()], latest),
    locationId: restockLocation(latest, locations),
    lines: variants.map((variant) => ({
      sku: {
        variantId: variant.id!,
        productId,
        sku: variant.sku ?? "",
        productName: name,
        variantLabel: variantAttributes(variant.attributes as Record<string, unknown> | null | undefined),
        baseUnit: variant.base_unit ?? "piece",
        wholeUnitsOnly: variant.whole_units_only ?? true,
        tracksExpiry: product.data.tracks_expiry ?? false,
      },
      lastCost: canCost ? restockCost(last.get(variant.id!) ?? null, newest.get(variant.id!) ?? null) : null,
    })),
  };
}
