import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree, loadPricingContext } from "@/lib/api/catalog-server";
import { load, serverApi } from "@/lib/api/server";
import { ProductEditor } from "../product-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products");
  return { title: t("editTitle") };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("products");
  const api = await serverApi();
  const product = await load(api.GET("/admin/products/{id}", { params: { path: { id } } }));
  if (!product.ok) {
    if (product.error.status === 404 || product.error.status === 422) notFound();
    return <PageError error={product.error} />;
  }
  const [tree, brands, pricing] = await Promise.all([
    loadCategoryTree(api),
    loadAllBrands(api),
    loadPricingContext(api),
  ]);
  if (!tree.ok) return <PageError error={tree.error} />;
  const name = product.data.name_ar || product.data.name_en;

  return (
    <>
      <Link
        href="/catalog/products"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader title={name} description={t("editDescription")} />
      <ProductEditor
        // A save refreshes the page; remounting adopts what the server now
        // holds — including SKU prices a rate publish changed on its own.
        key={[
          product.data.id,
          product.data.updated_at,
          ...(product.data.variants ?? []).map(
            (variant) => `${variant.id}:${variant.published_price}:${variant.awaiting_rate_id}`,
          ),
        ].join("|")}
        product={product.data}
        tree={tree.data}
        brands={brands.ok ? brands.data : []}
        pricing={pricing}
      />
    </>
  );
}
