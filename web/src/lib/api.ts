import type { components } from "@/types/api";
import { mockCategories, mockProducts, mockSettings } from "./mock-data";

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

export interface ProductQuery {
  q?: string;
  category_id?: string;
  min_price?: number;
  max_price?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "rating";
  page?: number;
  per_page?: number;
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
      const matches = query.category_id
        ? mockProducts.filter((p) => p.category_id === query.category_id)
        : mockProducts;
      return {
        page,
        per_page: perPage,
        total: matches.length,
        data: matches.slice((page - 1) * perPage, page * perPage),
      };
    }
    return request<ProductPage>("/products", { query: { ...query } });
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
