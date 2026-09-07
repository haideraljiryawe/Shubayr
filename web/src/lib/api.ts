import type { components, paths } from "@/types/api";
import {
  demoProducts,
  mockBanners,
  mockCategories,
  mockProducts,
  mockSettings,
  type Banner,
} from "./mock-data";

/* ---------------------------------------------------------------------------
 * Types come straight from api/openapi.yaml via `npm run gen:api`. Never hand-
 * write a response shape here — regenerate instead, so the client can never
 * drift from the shared contract.
 * ------------------------------------------------------------------------- */
type Schemas = components["schemas"];

export type StoreSettings = Schemas["StoreSettings"];
export type Product = Schemas["Product"];
export type Category = Schemas["Category"];
export type ProductPage = Schemas["ProductPage"];
export type Cart = Schemas["Cart"];

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Phase 1 ships before the backend does. With mocks on, the client resolves
 * from local fixtures and never touches the network; with mocks off it calls
 * the real API and a failure surfaces as an ApiError.
 */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(
  path: string,
  { query, ...init }: RequestInit & { query?: Query } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${init.method ?? "GET"} ${path} failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

export type ProductQuery = NonNullable<
  paths["/products"]["get"]["parameters"]["query"]
>;

/** Mirrors the `sort` values the contract allows on GET /products. */
function sortMockProducts(
  items: Product[],
  sort: ProductQuery["sort"],
): Product[] {
  switch (sort) {
    case "price_asc":
      return items.sort((a, b) => (a.sale_price ?? 0) - (b.sale_price ?? 0));
    case "price_desc":
      return items.sort((a, b) => (b.sale_price ?? 0) - (a.sale_price ?? 0));
    case "rating":
      return items.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
    case "newest":
      // Fixtures are authored newest-last; the contract has no created_at on
      // Product, so "newest" is the reverse fixture order until it does.
      return items.reverse();
    default:
      return items;
  }
}

export const api = {
  /**
   * White-label identity (rule #1). Read on every page load by ThemeProvider.
   * Public endpoint — `security: []` in the contract, so no auth header.
   */
  async getSettings(init?: RequestInit): Promise<StoreSettings> {
    if (USE_MOCKS) return mockSettings;
    return request<StoreSettings>("/settings", init);
  },

  async getCategories(init?: RequestInit): Promise<Category[]> {
    if (USE_MOCKS) return mockCategories;
    return request<Category[]>("/categories", init);
  },

  async listProducts(query: ProductQuery = {}): Promise<ProductPage> {
    if (USE_MOCKS) {
      const perPage = query.per_page ?? 20;
      const page = query.page ?? 1;

      let matches = [...mockProducts];
      if (query.category_id) {
        matches = matches.filter((p) => p.category_id === query.category_id);
      }
      if (query.q) {
        const needle = query.q.trim().toLowerCase();
        matches = matches.filter(
          (p) =>
            p.name_ar?.toLowerCase().includes(needle) ||
            p.name_en?.toLowerCase().includes(needle),
        );
      }
      if (query.min_price !== undefined) {
        matches = matches.filter(
          (p) => (p.sale_price ?? 0) >= query.min_price!,
        );
      }
      if (query.max_price !== undefined) {
        matches = matches.filter(
          (p) => (p.sale_price ?? 0) <= query.max_price!,
        );
      }
      if (query.on_sale) {
        matches = matches.filter(
          (p) => (p.compare_at_price ?? 0) > (p.sale_price ?? 0),
        );
      }

      // The mock honours `sort` so the home page's sections are genuinely
      // different sets rather than the same slice repeated.
      matches = sortMockProducts(matches, query.sort);

      return {
        page,
        per_page: perPage,
        total: matches.length,
        data: matches.slice((page - 1) * perPage, page * perPage),
      };
    }
    return request<ProductPage>("/products", { query: { ...query } });
  },

  /** Map the shared banner contract into the existing home carousel view. */
  async getBanners(): Promise<Banner[]> {
    if (USE_MOCKS) return mockBanners;
    const banners = await request<Schemas["Banner"][]>("/banners");
    return banners.map((banner, index) => ({
      id: banner.id ?? `banner-${index}`,
      title_ar: banner.title ?? "",
      title_en: banner.title ?? "",
      subtitle_ar: banner.subtitle ?? "",
      subtitle_en: banner.subtitle ?? "",
      cta_ar: banner.cta_text ?? "تسوق الآن",
      cta_en: banner.cta_text ?? "Shop now",
      href: banner.link_url ?? "/categories",
      image_url: banner.image_url ?? null,
    }));
  },

  /** Discounted products use the same typed endpoint as catalog filters. */
  async listDeals(limit = 6): Promise<Product[]> {
    return (await api.listProducts({ on_sale: true, per_page: limit })).data;
  },

  /** Product has no review count field; the published reviews envelope does. */
  async getProductReviewCount(id: string): Promise<number> {
    if (USE_MOCKS) {
      const product = demoProducts.find((item) => item.id === id);
      if (!product) throw new ApiError(404, `Product ${id} not found`);
      return product.review_count;
    }
    const reviews = await request<Schemas["ReviewPage"]>(
      `/products/${encodeURIComponent(id)}/reviews`,
      { query: { page: 1, per_page: 1 } },
    );
    return reviews.total;
  },

  async getProduct(id: string): Promise<Product> {
    if (USE_MOCKS) {
      const found = mockProducts.find((p) => p.id === id);
      if (!found) throw new ApiError(404, `Product ${id} not found`);
      return found;
    }
    return request<Product>(`/products/${id}`);
  },
};
