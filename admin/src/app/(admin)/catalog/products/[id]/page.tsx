import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Copy, PackagePlus, Plus, ShoppingCart, Truck } from "lucide-react";
import { buttonClasses, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree, loadPricingContext } from "@/lib/api/catalog-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { ADMIN_MODULES } from "@/lib/config";
import { stockTotals, type StockTotals } from "@/lib/inventory";
import { parseModules } from "@/lib/modules";
import type { RawSearchParams } from "@/lib/table-params";
import { ProductEditor } from "../product-editor";
import { VariantStock } from "../variant-stock";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products");
  return { title: t("editTitle") };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const t = await getTranslations("products");
  const api = await serverApi();
  const product = await load(api.GET("/admin/products/{id}", { params: { path: { id } } }));
  if (!product.ok) {
    if (product.error.status === 404 || product.error.status === 422) notFound();
    return <PageError error={product.error} />;
  }
  const [tree, brands, pricing, permissions] = await Promise.all([
    loadCategoryTree(api),
    loadAllBrands(api),
    loadPricingContext(api),
    loadPermissions(api),
  ]);
  if (!tree.ok) return <PageError error={tree.error} />;
  const name = product.data.name_ar || product.data.name_en;
  const variants = product.data.variants ?? [];
  const totals = permissions.includes("inventory.view") ? await variantTotals(api, variants.map((variant) => variant.id ?? "")) : null;
  const modules = parseModules(ADMIN_MODULES);
  const canOpenStock = modules.includes("stock") && permissions.includes("inventory.manage");
  const openingHref = `/inventory/openings/new?product=${product.data.id}`;
  // Restock (إعادة تعبئة المخزون) is a purchase from a supplier; opening stock
  // is for the first day's balances only. Once the product holds stock,
  // Restock leads and opening stock steps back.
  const canRestock = modules.includes("purchasing") && permissions.includes("purchases.create");
  const restockHref = `/purchasing/invoices/new?restock=${product.data.id}`;
  const hasStock = totals !== null && Object.values(totals).some((row) => row.onHand > 0);
  const restockFirst = canRestock && (hasStock || !canOpenStock);

  return (
    <>
      <Link
        href="/catalog/products"
        className="mb-3 inline-flex items-center gap-1 text-label text-primary-dark hover:underline"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader
        title={name}
        description={t("editDescription")}
        actions={
          <>
            {canRestock ? (
              <Link
                href={restockHref}
                className={buttonClasses({ variant: restockFirst ? "primary" : "secondary" })}
                data-testid="product-restock"
                data-primary={restockFirst ? "true" : "false"}
              >
                <Truck className="size-4" aria-hidden />
                {t("restock")}
              </Link>
            ) : null}
            {canOpenStock ? (
              <Link
                href={openingHref}
                className={buttonClasses({ variant: restockFirst ? "ghost" : "secondary" })}
                data-testid="product-opening-stock"
                data-primary={restockFirst ? "false" : "true"}
                title={t("openingStockHint")}
              >
                <PackagePlus className="size-4" aria-hidden />
                {t("openingStock")}
              </Link>
            ) : null}
            <Link href={`/catalog/products/new?from=${product.data.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="product-duplicate">
              <Copy className="size-4" aria-hidden />
              {t("duplicate")}
            </Link>
          </>
        }
      />
      {created ? (
        <Card className="mb-6 flex flex-col gap-3 border-success/40" data-testid="product-next-steps">
          <p className="font-bold">{t("nextSteps.title")}</p>
          <p className="text-body text-text-muted">
            {product.data.status === "active" ? t("nextSteps.published") : t("nextSteps.hidden")}
          </p>
          <div className="flex flex-wrap gap-2">
            {canOpenStock ? (
              <Link href={openingHref} className={buttonClasses({ size: "sm" })} data-testid="next-opening-stock">
                <PackagePlus className="size-4" aria-hidden />
                {t("nextSteps.openingStock")}
              </Link>
            ) : null}
            <Link
              href={`/catalog/products/new?category=${product.data.category_id}${product.data.brand_id ? `&brand=${product.data.brand_id}` : ""}`}
              className={buttonClasses({ size: "sm", variant: "secondary" })}
              data-testid="next-new-product"
            >
              <Plus className="size-4" aria-hidden />
              {t("nextSteps.another")}
            </Link>
            <Link href={`/catalog/products/new?from=${product.data.id}`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              <Copy className="size-4" aria-hidden />
              {t("nextSteps.duplicate")}
            </Link>
          </div>
        </Card>
      ) : null}
      <VariantStock variants={variants} totals={totals} />
      <p className="mb-6 flex items-center gap-2 text-body" data-testid="product-limit-summary" data-enabled={String(product.data.purchase_limit_enabled ?? false)}>
        <ShoppingCart className="size-4 text-text-muted" aria-hidden />
        {product.data.purchase_limit_enabled && product.data.purchase_limit_max_quantity != null
          ? t("limit.summaryOn", { max: product.data.purchase_limit_max_quantity })
          : t("limit.summaryOff")}
      </p>
      <ProductEditor
        // A save refreshes the page; remounting adopts what the server now
        // holds — including SKU prices a rate publish changed on its own.
        key={[
          product.data.id,
          product.data.updated_at,
          ...(product.data.images ?? []).map((image) => image.id),
          ...(product.data.variants ?? []).map(
            (variant) => `${variant.id}:${variant.published_price}:${variant.awaiting_rate_id}`,
          ),
        ].join("|")}
        product={product.data}
        tree={tree.data}
        brands={brands.ok ? brands.data : []}
        pricing={pricing}
        canCreateBrand={permissions.includes("catalog.brands")}
      />
    </>
  );
}

/** On hand and reserved per SKU from its lot balances (one page of 100 each). */
async function variantTotals(api: Awaited<ReturnType<typeof serverApi>>, ids: string[]): Promise<Record<string, StockTotals>> {
  const entries = await Promise.all(
    ids.filter(Boolean).map(async (id) => {
      const page = await load(api.GET("/admin/inventory/balances", { params: { query: { variant_id: id, per_page: 100 } } }));
      return [id, stockTotals(page.ok ? page.data.data : [])] as const;
    }),
  );
  return Object.fromEntries(entries);
}
