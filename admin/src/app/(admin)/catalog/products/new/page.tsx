import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree, loadPricingContext } from "@/lib/api/catalog-server";
import { serverApi } from "@/lib/api/server";
import { ProductEditor } from "../product-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products");
  return { title: t("newTitle") };
}

export default async function NewProductPage() {
  const t = await getTranslations("products");
  const api = await serverApi();
  const [tree, brands, pricing] = await Promise.all([
    loadCategoryTree(api),
    loadAllBrands(api),
    loadPricingContext(api),
  ]);
  if (!tree.ok) return <PageError error={tree.error} />;

  return (
    <>
      <Link
        href="/catalog/products"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader title={t("newTitle")} description={t("newDescription")} />
      <ProductEditor product={null} tree={tree.data} brands={brands.ok ? brands.data : []} pricing={pricing} />
    </>
  );
}
