import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import type { PickedSku } from "@/components/inventory/sku-picker";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { ApiError } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { OpeningForm } from "./opening-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("newDocument.opening") };
}

/**
 * Post opening stock (inventory.manage): new lots, valued, with their journal
 * entry. From a product (`?product=<id>`) the form starts with one line per
 * SKU of that product, so only quantities and costs are left to enter.
 */
export default async function NewOpeningPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("inventory");
  const raw = (await searchParams).product;
  const productId = typeof raw === "string" && UUID.test(raw) ? raw : null;
  const api = await serverApi();
  const [permissions, { locations }, product] = await Promise.all([
    loadPermissions(api),
    loadWarehouses(api),
    productId ? load(api.GET("/admin/products/{id}", { params: { path: { id: productId } } })) : null,
  ]);
  if (!permissions.includes("inventory.manage")) return <PageError error={new ApiError(403, "inventory.manage required")} />;
  const locale = await getLocale();
  const productName = product?.ok
    ? (locale === "ar" ? product.data.name_ar : product.data.name_en) || product.data.name_ar || product.data.name_en || ""
    : "";
  const initialSkus: PickedSku[] = product?.ok
    ? (product.data.variants ?? []).flatMap((variant) =>
        variant.id
          ? [
              {
                variantId: variant.id,
                productId: product.data.id ?? "",
                sku: variant.sku ?? "",
                productName,
                baseUnit: variant.base_unit ?? "piece",
                wholeUnitsOnly: variant.whole_units_only ?? true,
                tracksExpiry: product.data.tracks_expiry ?? false,
              },
            ]
          : [],
      )
    : [];
  const productHref = product?.ok ? `/catalog/products/${product.data.id}` : undefined;

  return (
    <>
      <Link href={productHref ?? "/inventory/openings"} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {productHref ? t("backToProduct") : t("documents.opening")}
      </Link>
      <PageHeader
        title={t("newDocument.opening")}
        description={product?.ok ? t("opening.forProduct", { name: productName }) : t("opening.description")}
      />
      <OpeningForm
        locations={[...locations.values()].filter((info) => info.active)}
        canSearchSku={permissions.includes("catalog.products")}
        initialSkus={initialSkus}
        productHref={productHref}
      />
    </>
  );
}
