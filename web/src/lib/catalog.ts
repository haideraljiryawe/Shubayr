import { api, ApiError, type Category, type ProductPage } from "./api";
import type { CatalogQuery } from "./catalog-query";

export function flattenCategories(categories: Category[]): Category[] {
  return categories.flatMap((category) => [
    category,
    ...flattenCategories(category.children ?? []),
  ]);
}

export function findCategoryBySlug(
  categories: Category[],
  slug: string,
): Category | undefined {
  return flattenCategories(categories).find(
    (category) => category.slug === slug,
  );
}

/**
 * The API has no minimum-rating parameter. Filter on the server, across the
 * complete matching result set, before computing the storefront pagination.
 * Reading just one API page here would hide matches and report false totals.
 */
export async function listCatalogProducts(
  query: CatalogQuery,
): Promise<ProductPage> {
  const { min_rating: minRating, ...apiQuery } = query;
  if (!minRating) return api.listProducts(apiQuery);

  const first = await api.listProducts({ ...apiQuery, page: 1, per_page: 100 });
  const all = [...first.data];
  if (first.per_page <= 0)
    throw new ApiError(502, "Invalid product pagination");
  const pageCount = Math.ceil(first.total / first.per_page);

  // Small batches keep backend concurrency bounded for larger catalogs.
  for (let page = 2; page <= pageCount; page += 4) {
    const pages = await Promise.all(
      Array.from({ length: Math.min(4, pageCount - page + 1) }, (_, offset) =>
        api.listProducts({
          ...apiQuery,
          page: page + offset,
          per_page: first.per_page,
        }),
      ),
    );
    for (const result of pages) all.push(...result.data);
  }

  const matches = all.filter(
    (product) => (product.rating_avg ?? 0) >= minRating,
  );
  const page = apiQuery.page ?? 1;
  const perPage = apiQuery.per_page ?? 12;
  return {
    page,
    per_page: perPage,
    total: matches.length,
    data: matches.slice((page - 1) * perPage, page * perPage),
  };
}
