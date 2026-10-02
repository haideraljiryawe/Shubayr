import { api, ApiError, type Category, type ProductPage } from "./api";
import type { CatalogQuery } from "./catalog-query";

export { twoLevelTree } from "./category-tree";

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

export type BrandFacet = NonNullable<ProductPage["facets"]>["brands"][number];

/**
 * The API has no minimum-rating parameter. Filter on the server, across the
 * complete matching result set, before computing the storefront pagination.
 * Reading just one API page here would hide matches and report false totals.
 *
 * Brand facets follow the API's convention — counted with every other filter
 * applied but not the brand filter itself, so choosing one brand still shows
 * how many products the others would add. With a rating filter the whole set
 * is read without brands, rated here, counted, and only then narrowed.
 */
export async function listCatalogProducts(
  query: CatalogQuery,
): Promise<ProductPage> {
  const { min_rating: minRating, ...apiQuery } = query;
  if (!minRating) return api.listProducts(apiQuery);

  const { brand_id: brandIds, ...withoutBrands } = apiQuery;
  const first = await api.listProducts({
    ...withoutBrands,
    page: 1,
    per_page: 100,
  });
  const all = [...first.data];
  if (first.per_page <= 0)
    throw new ApiError(502, "Invalid product pagination");
  const pageCount = Math.ceil(first.total / first.per_page);

  // Small batches keep backend concurrency bounded for larger catalogs.
  for (let page = 2; page <= pageCount; page += 4) {
    const pages = await Promise.all(
      Array.from({ length: Math.min(4, pageCount - page + 1) }, (_, offset) =>
        api.listProducts({
          ...withoutBrands,
          page: page + offset,
          per_page: first.per_page,
        }),
      ),
    );
    for (const result of pages) all.push(...result.data);
  }

  const rated = all.filter((product) => (product.rating_avg ?? 0) >= minRating);
  const counts = new Map<string, number>();
  for (const product of rated) {
    if (product.brand_id) {
      counts.set(product.brand_id, (counts.get(product.brand_id) ?? 0) + 1);
    }
  }
  const matches = brandIds?.length
    ? rated.filter(
        (product) => product.brand_id && brandIds.includes(product.brand_id),
      )
    : rated;
  const page = apiQuery.page ?? 1;
  const perPage = apiQuery.per_page ?? 12;
  return {
    page,
    per_page: perPage,
    total: matches.length,
    data: matches.slice((page - 1) * perPage, page * perPage),
    facets: {
      brands: [...counts.entries()].map(([brand_id, count]) => ({
        brand_id,
        count,
      })),
    },
  };
}
