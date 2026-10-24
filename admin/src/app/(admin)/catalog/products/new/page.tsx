import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAllBrands, loadCategoryTree, loadPricingContext } from "@/lib/api/catalog-server";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { ProductEditor, type ProductSeed } from "../product-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("products");
  return { title: t("newTitle") };
}

function first(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return text && UUID.test(text) ? text : undefined;
}

/**
 * A new product: blank, or seeded — `?from=<id>` copies another product
 * ("duplicate"), and `?category=` / `?brand=` keep the choices of the product
 * saved just before ("save and add another").
 */
export default async function NewProductPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("products");
  const query = await searchParams;
  const api = await serverApi();
  const from = first(query.from);
  const [tree, brands, pricing, permissions, template] = await Promise.all([
    loadCategoryTree(api),
    loadAllBrands(api),
    loadPricingContext(api),
    loadPermissions(api),
    from ? load(api.GET("/admin/products/{id}", { params: { path: { id: from } } })) : null,
  ]);
  if (!tree.ok) return <PageError error={tree.error} />;
  if (template && !template.ok && template.error.status !== 404) return <PageError error={template.error} />;
  const seed: ProductSeed = {
    template: template?.ok ? template.data : undefined,
    categoryId: first(query.category),
    brandId: first(query.brand),
  };

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
        title={seed.template ? t("copyTitle") : t("newTitle")}
        description={t("newDescription")}
      />
      <ProductEditor
        // Each visit (another "save and add another") starts a fresh form.
        key={[from ?? "", seed.categoryId ?? "", seed.brandId ?? "", String(query.n ?? "")].join("|")}
        product={null}
        seed={seed}
        tree={tree.data}
        brands={brands.ok ? brands.data : []}
        pricing={pricing}
        canCreateBrand={permissions.includes("catalog.brands")}
      />
    </>
  );
}
