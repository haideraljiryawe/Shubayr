import type { components, paths } from "@/types/api";
import {
  demoProducts,
  mockAvailabilityFor,
  mockCouponFor,
  mockReviewsFor,
  mockBanners,
  mockCategories,
  mockProducts,
  mockSettings,
  nextMockOrderNumber,
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
export type ProductVariant = Schemas["ProductVariant"];
export type ProductAvailability = Schemas["ProductAvailability"];
export type Review = Schemas["Review"];
export type ReviewPage = Schemas["ReviewPage"];
export type Coupon = Schemas["Coupon"];
export type Address = Schemas["Address"];
export type AddressInput = Schemas["AddressInput"];
export type Order = Schemas["Order"];
export type OrderItem = Schemas["OrderItem"];

/** Request body of POST /orders, straight from the contract. */
export type OrderRequest =
  paths["/orders"]["post"]["requestBody"]["content"]["application/json"];

/**
 * Mock-only companion to OrderRequest. The real endpoint prices the order from
 * the authenticated server cart, which a guest does not have — so the fixture
 * needs the basket handed to it to echo a believable order back. Once the
 * backend is live this argument is ignored and can be dropped.
 */
export interface OrderDraft {
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
}

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

/**
 * Mocked writes resolve on a later tick so the UI genuinely passes through its
 * pending state — a submit button that never disables would look fine here and
 * break the moment a real network is behind it.
 */
function mockLatency(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return request<Product>(`/products/${encodeURIComponent(id)}`);
  },

  /**
   * Per-variant sellable quantity. Kept separate from getProduct because the
   * contract computes it at read time — it is the volatile half of the page and
   * the part that must not be cached with the catalog copy.
   */
  async getProductAvailability(id: string): Promise<ProductAvailability> {
    if (USE_MOCKS) {
      const product = demoProducts.find((item) => item.id === id);
      if (!product) throw new ApiError(404, `Product ${id} not found`);
      return mockAvailabilityFor(product);
    }
    return request<ProductAvailability>(
      `/products/${encodeURIComponent(id)}/availability`,
    );
  },

  /**
   * Validate a discount code. The contract answers 200 with the coupon or 404
   * when the code is unknown or no longer usable, so callers treat any
   * ApiError(404) as "invalid or expired" and everything else as a failure to
   * reach the service.
   */
  async validateCoupon(code: string): Promise<Coupon> {
    if (USE_MOCKS) {
      await mockLatency();
      const coupon = mockCouponFor(code);
      if (!coupon) throw new ApiError(404, `Coupon ${code} is not valid`);
      return coupon;
    }
    return request<Coupon>("/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: code.trim() }),
    });
  },

  /**
   * Create a delivery address. POST /orders references an address by id, so a
   * checkout that types a new address creates it first and places the order
   * against the id that comes back.
   */
  async createAddress(input: AddressInput): Promise<Address> {
    if (USE_MOCKS) {
      await mockLatency();
      return { id: `addr-${Date.now().toString(36)}`, ...input };
    }
    return request<Address>("/addresses", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /**
   * Place a Cash-on-Delivery order. Requires an authenticated customer — the
   * checkout gates on that before calling.
   */
  async placeOrder(body: OrderRequest, draft?: OrderDraft): Promise<Order> {
    if (USE_MOCKS) {
      await mockLatency();
      return {
        id: `order-${Date.now().toString(36)}`,
        order_number: nextMockOrderNumber(),
        status: "pending",
        payment_method: body.payment_method ?? "cod",
        address_id: body.address_id,
        subtotal: draft?.subtotal ?? 0,
        delivery_fee: draft?.delivery_fee ?? 0,
        discount: draft?.discount ?? 0,
        total: draft?.total ?? 0,
        placed_at: new Date().toISOString(),
        items: draft?.items ?? [],
      };
    }
    return request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify({ payment_method: "cod", ...body }),
    });
  },

  /** Published reviews, paginated with the shared Pagination envelope. */
  async listReviews(
    id: string,
    { page = 1, per_page = 5 }: { page?: number; per_page?: number } = {},
  ): Promise<ReviewPage> {
    if (USE_MOCKS) {
      const all = mockReviewsFor(id);
      return {
        page,
        per_page,
        total: all.length,
        data: all.slice((page - 1) * per_page, page * per_page),
      };
    }
    return request<ReviewPage>(
      `/products/${encodeURIComponent(id)}/reviews`,
      { query: { page, per_page } },
    );
  },
};
