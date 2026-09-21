import { getTranslations } from "next-intl/server";
import { api, type Category, type ProductPage } from "@/lib/api";
import { listCatalogProducts } from "@/lib/catalog";
import { catalogHref, type CatalogQuery } from "@/lib/catalog-query";
import { Link } from "@/i18n/navigation";
import { localeDirection, type Locale } from "@/i18n/routing";
import { ProductCard } from "@/components/ui/product-card";
import { pricingForVariant, primaryImageUrl } from "@/lib/product";
import { buttonClasses } from "@/components/ui/button";
import { DesktopFilters, MobileFilters, SortControl } from "./filters";
import { CatalogEmpty, CatalogError } from "./states";

export async function ProductListing({
  locale,
  title,
  basePath,
  query,
  categories,
  category,
  categoriesFailed = false,
}: {
  locale: Locale;
  title: string;
  basePath: string;
  query: CatalogQuery;
  categories: Category[];
  category?: Category;
  categoriesFailed?: boolean;
}) {
  const t = await getTranslations("catalog");
  let result: ProductPage;
  try {
    result = await listCatalogProducts(query);
  } catch {
    return <CatalogError />;
  }
  const counts = await Promise.all(
    result.data.map((product) =>
      product.id
        ? api.getProductReviewCount(product.id).catch(() => undefined)
        : Promise.resolve(undefined),
    ),
  );
  const format = (value: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US").format(value);
  const pages = Math.ceil(result.total / result.per_page);
  const pageNumbers = [
    ...new Set([1, result.page - 1, result.page, result.page + 1, pages]),
  ]
    .filter((page) => page >= 1 && page <= pages)
    .sort((a, b) => a - b);
  const filters = { basePath, query, categories, category };
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-bold leading-relaxed lg:text-3xl">
          {title}
        </h1>
        <p className="text-sm text-text-muted" data-testid="result-count">
          <bdi dir="ltr">{format(result.total)}</bdi> {t("products")}
        </p>
      </div>
      {categoriesFailed && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-border bg-surface p-4 text-sm"
        >
          {t("categoriesError")}
        </p>
      )}
      <div dir="ltr" className="flex items-start gap-6">
        <div dir={localeDirection[locale]} className="hidden lg:block">
          <DesktopFilters {...filters} />
        </div>
        <section
          dir={localeDirection[locale]}
          className="min-w-0 flex-1"
          aria-label={title}
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <SortControl basePath={basePath} query={query} />
            <MobileFilters {...filters} />
            {query.on_sale && (
              <span className="rounded-md bg-error-dark px-3 py-2 text-xs font-semibold text-white">
                {t("onSale")}
              </span>
            )}
          </div>
          {result.data.length === 0 ? (
            <CatalogEmpty resetHref={basePath} />
          ) : (
            <>
              <ul
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                data-testid="product-grid"
              >
                {result.data.map((product, index) => (
                  <li key={product.id} className="flex min-w-0">
                    <ProductCard
                      id={product.id ?? ""}
                      name={
                        (locale === "ar" ? product.name_ar : product.name_en) ??
                        ""
                      }
                      {...pricingForVariant(product)}
                      requiresVariant={(product.variants ?? []).length > 0}
                      rating={product.rating_avg}
                      reviewCount={counts[index]}
                      imageUrl={primaryImageUrl(product)}
                      inStock={product.in_stock}
                      priority={index < 4}
                      variant="catalog"
                      className="w-full"
                      imageSizes="(min-width: 1280px) 180px, (min-width: 1024px) 165px, (min-width: 640px) 30vw, 46vw"
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-8 border-t border-border pt-6 text-center">
                <p className="mb-4 text-sm text-text-muted">
                  {t("showing", {
                    from: format((result.page - 1) * result.per_page + 1),
                    to: format(
                      Math.min(result.page * result.per_page, result.total),
                    ),
                    total: format(result.total),
                  })}
                </p>
                {pages > 1 && (
                  <nav
                    aria-label={t("pagination")}
                    className="flex flex-wrap justify-center gap-2"
                  >
                    {result.page > 1 && (
                      <Link
                        href={catalogHref(basePath, query, {
                          page: result.page - 1,
                        })}
                        rel="prev"
                        className={buttonClasses({
                          variant: "secondary",
                          className: "px-3",
                        })}
                      >
                        {t("previous")}
                      </Link>
                    )}
                    {pageNumbers.map((page, index) => (
                      <span key={page} className="inline-flex gap-2">
                        {index > 0 && page - pageNumbers[index - 1] > 1 && (
                          <span className="self-center" aria-hidden>
                            …
                          </span>
                        )}
                        <Link
                          href={catalogHref(basePath, query, { page })}
                          aria-current={
                            page === result.page ? "page" : undefined
                          }
                          aria-label={t("page", { number: format(page) })}
                          className={buttonClasses({
                            variant: page === result.page ? "cta" : "light",
                            className: "min-w-11 px-3",
                          })}
                        >
                          <bdi>{format(page)}</bdi>
                        </Link>
                      </span>
                    ))}
                    {result.page < pages && (
                      <Link
                        href={catalogHref(basePath, query, {
                          page: result.page + 1,
                        })}
                        rel="next"
                        className={buttonClasses({
                          variant: "secondary",
                          className: "px-3",
                        })}
                      >
                        {t("next")}
                      </Link>
                    )}
                  </nav>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
