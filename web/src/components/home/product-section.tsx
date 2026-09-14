import { getTranslations } from "next-intl/server";
import { SectionHeader } from "@/components/ui/section-header";
import { ProductCard } from "@/components/ui/product-card";
import { pricingForVariant } from "@/lib/product";
import type { Product } from "@/lib/api";
import type { DemoProduct } from "@/lib/mock-data";
import type { Locale } from "@/i18n/routing";
import { SectionEmpty, SectionError } from "./states";

/**
 * The fixture-only review count is optional; sale metadata comes directly
 * from the shared Product contract.
 */
function displayExtras(product: Product) {
  const extras = product as Partial<DemoProduct>;
  return {
    reviewCount: extras.review_count,
  };
}

/**
 * A titled product strip. Fetching happens here rather than in the page so each
 * section can stream in behind its own Suspense boundary and fail on its own —
 * one dead endpoint degrades one strip instead of the whole home page.
 */
export async function ProductSection({
  title,
  viewAllHref,
  locale,
  load,
  priority = false,
}: {
  title: string;
  viewAllHref: string;
  locale: Locale;
  load: () => Promise<Product[]>;
  /** Set on the first grid so its images are LCP candidates. */
  priority?: boolean;
}) {
  const t = await getTranslations("common");

  let products: Product[] | null = null;
  try {
    products = await load();
  } catch {
    products = null;
  }

  return (
    <section className="mt-10">
      <SectionHeader
        title={title}
        actionLabel={t("viewAll")}
        href={viewAllHref}
      />

      <div className="mt-4">
        {products === null ? (
          <SectionError />
        ) : products.length === 0 ? (
          <SectionEmpty />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {products.map((product, index) => {
              const { reviewCount } = displayExtras(product);
              const name =
                (locale === "ar" ? product.name_ar : product.name_en) ?? "";

              return (
                <li key={product.id} className="flex">
                  <ProductCard
                    id={product.id ?? ""}
                    name={name}
                    nameAr={product.name_ar ?? ""}
                    nameEn={product.name_en ?? ""}
                    availableQty={product.available_qty}
                    {...pricingForVariant(product)}
                    rating={product.rating_avg}
                    reviewCount={reviewCount}
                    imageUrl={product.images?.[0] ?? null}
                    inStock={product.in_stock ?? true}
                    priority={priority && index < 5}
                    className="w-full"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
