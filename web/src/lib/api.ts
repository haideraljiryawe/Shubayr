import type { components, paths } from "@/types/api";
import { isLive } from "./data-source";
import {
  createMockAddress,
  deleteMockReview,
  getMockAddress,
  getMockNotificationPreferences,
  redeemMockLoyalty,
  updateMockNotificationPreferences,
  updateMockReview,
  deleteMockAddress,
  getMockOrder,
  getMockUser,
  isMockAccessTokenValid,
  isMockRefreshTokenValid,
  listMockAddresses,
  listMockOrders,
  mockAccessToken,
  mockRefreshToken,
  mockTrackingFor,
  MOCK_OTP,
  rememberMockOrder,
  updateMockAddress,
  updateMockUser,
  signInMockPhone,
  listMockWishlist,
  addMockWishlistItem,
  removeMockWishlistItem,
  getMockLoyalty,
  createMockReturn,
  listMockReturns,
  createMockReview,
  createMockDeliveryRating,
  listMockReviewedOrderItems,
  listMockMyReviews,
} from "./mock-account";
import {
  getMockMonitorOrder,
  listMockDeliveries,
  listMockInbox,
  listMockMonitorOrders,
  markAllMockRead,
  markMockRead,
  mockUnreadCount,
  updateMockDelivery,
} from "./mock-work";
import { STORE_TIME_ZONE } from "./config";
import {
  demoProducts,
  mockAvailabilityFor,
  mockCouponFor,
  mockReviewsFor,
  mockBanners,
  mockBrands,
  mockCategories,
  mockProducts,
  mockSettings,
  nextMockOrderNumber,
  type Banner,
} from "./mock-data";
import { twoLevelTree } from "./category-tree";

/* ---------------------------------------------------------------------------
 * Types come straight from api/openapi.yaml via `npm run gen:api`. Never hand-
 * write a response shape here — regenerate instead, so the client can never
 * drift from the shared contract.
 * ------------------------------------------------------------------------- */
type Schemas = components["schemas"];

export type StoreSettings = Schemas["StoreSettings"];
export type Product = Schemas["Product"];
export type ProductImage = Schemas["ProductImage"];
export type Category = Schemas["Category"];
export type ProductPage = Schemas["ProductPage"];
export type Brand = Schemas["Brand"];
export type BrandPage = Schemas["BrandPage"];
export type Cart = Schemas["Cart"];
export type CartItem = NonNullable<Cart["items"]>[number];
export type ProductVariant = Schemas["ProductVariant"];
export type ProductAvailability = Schemas["ProductAvailability"];
export type Review = Schemas["Review"];
export type ReviewPage = Schemas["ReviewPage"];
export type CustomerReview = Schemas["CustomerReview"];
export type CustomerReviewPage = Schemas["CustomerReviewPage"];
export type Coupon = Schemas["Coupon"];
export type User = Schemas["User"];
export type AppRole = NonNullable<User["role"]>;
export type ApiErrorBody = Schemas["Error"];
export type FieldError = Schemas["FieldError"];
export type AuthTokens = Schemas["AuthTokens"];
export type AddressPage = Schemas["AddressPage"];
export type OrderPage = Schemas["OrderPage"];
export type OrderStatus = Schemas["OrderStatus"];
export type OrderTracking = Schemas["OrderTracking"];
export type Address = Schemas["Address"];
export type AddressCreate = Schemas["AddressCreate"];
export type AddressPatch = Schemas["AddressPatch"];
export type Order = Schemas["Order"];
export type OrderItem = Schemas["OrderItem"];
export type UserSelfUpdate = Schemas["UserSelfUpdate"];
export type WishlistItem = Schemas["WishlistItem"];
export type WishlistPage = Schemas["WishlistPage"];
export type LoyaltyAccount = Schemas["LoyaltyAccount"];
export type LoyaltyEntry = NonNullable<LoyaltyAccount["ledger"]>[number];
export type Return = Schemas["Return"];
export type ReturnPage = Schemas["ReturnPage"];
export type ReturnStatus = NonNullable<Return["status"]>;
export type ReturnItem = Schemas["ReturnItem"];
export type DeliveryRating = Schemas["DeliveryRating"];
export type LoyaltyRedemption = Schemas["LoyaltyRedemption"];
export type NotificationPreferences = Schemas["NotificationPreferences"];
export type NotificationPreferenceEntry =
  Schemas["NotificationPreferenceEntry"];
export type NotificationType = NotificationPreferenceEntry["type"];
export type NotificationChannel = NotificationPreferenceEntry["channel"];

/* Work pages and the notification center (API 6.1, build phase 2). */
export type MonitorOrderPage = Schemas["MonitorOrderPage"];
export type MonitorOrderListItem = Schemas["MonitorOrderListItem"];
export type MonitorOrderDetail = Schemas["MonitorOrderDetail"];
export type MonitorOrderQuery = NonNullable<
  paths["/monitor/orders"]["get"]["parameters"]["query"]
>;
export type Delivery = Schemas["Delivery"];
export type DeliveryPage = Schemas["DeliveryPage"];
export type DeliveryStatus = NonNullable<Delivery["status"]>;
/** Named for the inbox so it never shadows the DOM's `Notification`. */
export type InboxNotification = Schemas["Notification"];
export type NotificationPage = Schemas["NotificationPage"];
export type StreamTicket =
  paths["/notifications/stream-ticket"]["post"]["responses"]["201"]["content"]["application/json"];

/** Request bodies, straight from the contract. */
export type ReturnRequest =
  paths["/returns"]["post"]["requestBody"]["content"]["application/json"];
export type ReviewRequest =
  paths["/products/{id}/reviews"]["post"]["requestBody"]["content"]["application/json"];
export type DeliveryRatingRequest =
  paths["/deliveries/{id}/rating"]["post"]["requestBody"]["content"]["application/json"];
export type ReviewPatch =
  paths["/reviews/{id}"]["patch"]["requestBody"]["content"]["application/json"];

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
 * The backend lands one slice at a time, so live-vs-mock is decided per domain
 * rather than globally: each method below asks about its own domain. Slice 1
 * has auth, profile, catalog and banners on the real API; everything else
 * still answers from fixtures and is marked `MOCK: awaiting backend slice`.
 * See src/lib/data-source.ts for the env contract.
 */
export { isLive, liveDomainList, type Domain } from "./data-source";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The contract's machine-readable `code` from the unified Error envelope
     * (e.g. `WORK_ACCOUNT_SHOPPING_FORBIDDEN`), when the response carried one.
     * Route on this, not on the message, which is for humans.
     */
    readonly code?: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** API 6.0: purchase functions answer this 403 to a work account. */
export const WORK_ACCOUNT_SHOPPING_FORBIDDEN =
  "WORK_ACCOUNT_SHOPPING_FORBIDDEN";

export function isWorkAccountForbidden(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.code === WORK_ACCOUNT_SHOPPING_FORBIDDEN
  );
}

/**
 * Turn a failed response into an ApiError, keeping the contract's `code` and
 * field errors when the body is the unified Error envelope. Anything else (a
 * proxy's HTML page, an empty body) still yields an error with the status.
 */
async function toApiError(
  response: Response,
  method: string,
  path: string,
): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    body = null;
  }
  const error = new ApiError(
    response.status,
    typeof body?.message === "string"
      ? body.message
      : `${method} ${path} failed with ${response.status}`,
    typeof body?.code === "string" ? body.code : undefined,
    Array.isArray(body?.errors) ? body.errors : [],
  );
  if (isWorkAccountForbidden(error)) tokenProvider?.onWorkAccountForbidden?.();
  return error;
}

type Query = Record<
  string,
  string | number | boolean | readonly string[] | undefined
>;

/* ---------------------------------------------------------------------------
 * Credentials.
 *
 * The session store registers itself here; the client never imports it back.
 * Everything that touches a raw token lives in these few functions, so moving
 * to httpOnly-cookie auth later means changing them and nothing else.
 * ------------------------------------------------------------------------- */

export interface TokenProvider {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  onTokens(tokens: { access_token: string; refresh_token: string }): void;
  onSignedOut(): void;
  /**
   * The API refused a purchase function because the session belongs to a work
   * account. The session store re-reads the user so the UI can switch to the
   * work-account landing even if its cached profile said otherwise.
   */
  onWorkAccountForbidden?(): void;
}

let tokenProvider: TokenProvider | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function accessToken(): string | null {
  return tokenProvider?.getAccessToken() ?? null;
}

/** In-flight refresh, shared so a burst of 401s produces one refresh call. */
let refreshing: Promise<boolean> | null = null;

async function runRefresh(): Promise<boolean> {
  const refresh_token = tokenProvider?.getRefreshToken();
  if (!refresh_token) return false;
  try {
    const pair = await api.refreshTokens(refresh_token);
    tokenProvider?.onTokens(pair);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshing ??= runRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Run an authenticated call, retrying once behind a token refresh.
 *
 * This wraps the whole call rather than the fetch, so the mocked endpoints —
 * which validate the same mock access token and answer 401 when it has expired
 * — exercise the identical retry path. If the refresh fails, the session is
 * cleared and the original 401 is rethrown for the caller to route on.
 */
export async function withFreshToken<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
    if (!(await refreshOnce())) {
      tokenProvider?.onSignedOut();
      throw cause;
    }
    return run();
  }
}

/**
 * Every call keeps its 10-second ceiling; a caller's own signal (a search box
 * cancelling the request its previous keystroke started) is added to it
 * rather than replacing it.
 */
function withTimeout(signal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(10_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  path: string,
  { query, ...init }: RequestInit & { query?: Query } = {},
): Promise<T> {
  const token = accessToken();
  const response = await fetch(buildUrl(path, query), {
    ...init,
    signal: withTimeout(init.signal),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response, init.method ?? "GET", path);
  }

  return (await response.json()) as T;
}

/** Same as request(), for endpoints the contract answers with 204 No Content. */
async function requestNoContent(
  path: string,
  { query, ...init }: RequestInit & { query?: Query } = {},
): Promise<void> {
  const token = accessToken();
  const response = await fetch(buildUrl(path, query), {
    ...init,
    signal: withTimeout(init.signal),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw await toApiError(response, init.method ?? "GET", path);
  }
}

export type ProductQuery = NonNullable<
  paths["/products"]["get"]["parameters"]["query"]
>;

/** What the shopper pays: the contract's computed `effective_price`. */
function paidPrice(product: Product): number {
  return product.effective_price ?? product.price ?? 0;
}

/** Mirrors the `sort` values the contract allows on GET /products. */
function sortMockProducts(
  items: Product[],
  sort: ProductQuery["sort"],
): Product[] {
  switch (sort) {
    // The contract sorts on effective_price — what the shopper would pay now.
    case "price_asc":
      return items.sort((a, b) => paidPrice(a) - paidPrice(b));
    case "price_desc":
      return items.sort((a, b) => paidPrice(b) - paidPrice(a));
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

/**
 * Guard a mocked endpoint that the contract marks as authenticated.
 *
 * With auth mocked, rejecting an expired mock token with a real 401 is what
 * lets `withFreshToken` prove its refresh-and-retry works without a backend.
 *
 * With auth LIVE, the stored token is a real JWT the API issued, so the mock
 * token check would reject every signed-in customer and take the whole mocked
 * half of the account down with it. The session's existence is then the only
 * thing a fixture can meaningfully assert — the real API already validated it
 * at sign-in, and the mocked endpoint has no signature to check against.
 */
/**
 * Guard a LIVE authenticated endpoint before the request leaves the browser.
 *
 * The API would answer 401 anyway; failing here keeps a signed-out visitor
 * from a pointless round trip, and gives `withFreshToken` the same 401 shape
 * it already knows how to route on.
 */
function requireAuthenticated(): void {
  if (!accessToken()) {
    throw new ApiError(401, "Not signed in");
  }
}

function requireMockAuth(): void {
  const token = accessToken();
  const valid = isLive("auth")
    ? Boolean(token)
    : isMockAccessTokenValid(token);
  if (!valid) {
    throw new ApiError(401, "Access token missing or expired");
  }
}

/**
 * The contract writes phone numbers in E.164 ("+9647701234567"); Iraqi
 * customers type them locally ("07701234567"). Normalising here keeps the
 * forms in the format people actually use.
 */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+964${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * The contract's own `contact_phone` pattern, enforced server-side since
 * v5.3.0: a leading +, a non-zero country digit, then 7-14 more digits.
 *
 * Checking it before submitting turns what would be a 422 round trip into an
 * inline field error, which is the difference between "this number is wrong"
 * pointing at the box and a banner appearing after a save that failed.
 */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isE164(phone: string): boolean {
  return E164_PATTERN.test(phone);
}

export const api = {
  /**
   * White-label identity (rule #1). Read on every page load by ThemeProvider.
   * Public endpoint — `security: []` in the contract, so no auth header.
   */
  async getSettings(init?: RequestInit): Promise<StoreSettings> {
    if (!isLive("catalog")) return mockSettings;
    return request<StoreSettings>("/settings", init);
  },

  /** Departments with their subcategories — exactly two levels, see twoLevelTree. */
  async getCategories(init?: RequestInit): Promise<Category[]> {
    if (!isLive("catalog")) return twoLevelTree(mockCategories);
    return twoLevelTree(await request<Category[]>("/categories", init));
  },

  /**
   * Every visible brand, in the admin's display order. The contract pages
   * GET /brands; a store has tens of brands, not thousands, so the pages are
   * read through and joined for the filter and the brands page.
   */
  async listBrands(): Promise<Brand[]> {
    if (!isLive("catalog")) {
      return mockBrands
        .filter((brand) => brand.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    const brands: Brand[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const result = await request<BrandPage>("/brands", {
        query: { page, per_page: 100 },
      });
      brands.push(...result.data);
      if (page * result.per_page >= result.total) break;
    }
    return brands;
  },

  async listProducts(query: ProductQuery = {}): Promise<ProductPage> {
    if (!isLive("catalog")) {
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
        matches = matches.filter((p) => paidPrice(p) >= query.min_price!);
      }
      if (query.max_price !== undefined) {
        matches = matches.filter((p) => paidPrice(p) <= query.max_price!);
      }
      if (query.on_sale) {
        // "Currently discounted": the backend has already applied the
        // scheduled window, so the flag is taken at face value.
        matches = matches.filter((p) => p.on_sale === true);
      }

      // Facets are counted before the brand filter, as the API counts them:
      // every other filter applies, the brand filter itself does not.
      const counts = new Map<string, number>();
      for (const product of matches) {
        if (!product.brand_id) continue;
        counts.set(product.brand_id, (counts.get(product.brand_id) ?? 0) + 1);
      }
      const brandIds = query.brand_id ?? [];
      if (brandIds.length) {
        matches = matches.filter(
          (p) => p.brand_id != null && brandIds.includes(p.brand_id),
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
        facets: {
          brands: [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([brand_id, count]) => ({ brand_id, count })),
        },
      };
    }
    return request<ProductPage>("/products", { query });
  },

  /** Map the shared banner contract into the existing home carousel view. */
  async getBanners(): Promise<Banner[]> {
    if (!isLive("banners")) return mockBanners;
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
    if (!isLive("catalog")) {
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
    if (!isLive("catalog")) {
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
    if (!isLive("catalog")) {
      const product = demoProducts.find((item) => item.id === id);
      if (!product) throw new ApiError(404, `Product ${id} not found`);
      return mockAvailabilityFor(product);
    }
    return request<ProductAvailability>(
      `/products/${encodeURIComponent(id)}/availability`,
    );
  },

  /* ------------------------------------------------------------- auth */

  /** Ask for an OTP. Public endpoint; the contract rate-limits it with 429. */
  async requestOtp(phone: string): Promise<{ otp_sent: boolean }> {
    if (!isLive("auth")) {
      await mockLatency();
      return { otp_sent: true };
    }
    return request<{ otp_sent: boolean }>("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone: toE164(phone) }),
    });
  },

  /** Exchange phone + code for the token pair and the user. 401 = bad code. */
  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    if (!isLive("auth")) {
      await mockLatency();
      if (code.trim() !== MOCK_OTP) {
        throw new ApiError(401, "Invalid or expired verification code");
      }
      const user = signInMockPhone(toE164(phone), phone);
      return {
        access_token: mockAccessToken(user.id ?? "u-1"),
        refresh_token: mockRefreshToken(user.id ?? "u-1"),
        user,
      };
    }
    // API 6.0: name the client and never send a role — the server resolves
    // it, and a work phone comes back as delivery_agent or order_monitor.
    return request<AuthTokens>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({
        phone: toE164(phone),
        code: code.trim(),
        client: "web_store",
      }),
    });
  },

  /**
   * Revoke the refresh token on the server (POST /auth/logout). Best effort:
   * signing out locally must never wait on, or fail because of, the network.
   */
  async logout(refresh_token: string): Promise<void> {
    if (!isLive("auth")) return;
    await requestNoContent("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    });
  },

  /**
   * Swap a refresh token for a new pair. Called only by the client's own retry
   * path — components never touch it.
   */
  async refreshTokens(
    refresh_token: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    if (!isLive("auth")) {
      await mockLatency(120);
      if (!isMockRefreshTokenValid(refresh_token)) {
        throw new ApiError(401, "Refresh token rejected");
      }
      const id = refresh_token.split(".")[1] ?? "u-1";
      return {
        access_token: mockAccessToken(id),
        refresh_token: mockRefreshToken(id),
      };
    }
    return request<{ access_token: string; refresh_token: string }>(
      "/auth/refresh",
      { method: "POST", body: JSON.stringify({ refresh_token }) },
    );
  },

  /**
   * The signed-in account. On the web store this is an app-surface session, so
   * `role` is customer, delivery_agent or order_monitor and `permissions` is empty.
   */
  async getMe(): Promise<User> {
    return withFreshToken(async () => {
      if (!isLive("profile")) {
        await mockLatency(120);
        requireMockAuth();
        return getMockUser();
      }
      return request<User>("/me");
    });
  },

  /**
   * Save profile edits through PATCH /me.
   *
   * The contract accepts name and email only: a phone change needs OTP
   * re-verification, so it goes through the auth flow rather than here.
   */
  async updateMe(input: UserSelfUpdate): Promise<User> {
    return withFreshToken(async () => {
      if (!isLive("profile")) {
        await mockLatency();
        requireMockAuth();
        return updateMockUser(input);
      }
      return request<User>("/me", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    });
  },

  /* -------------------------------------------------------- addresses */

  async listAddresses(): Promise<Address[]> {
    return withFreshToken(async () => {
      if (!isLive("addresses")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockAddresses();
      }
      const page = await request<AddressPage>("/addresses", {
        query: { per_page: 50 },
      });
      return page.data;
    });
  },

  async updateAddress(id: string, input: AddressPatch): Promise<Address> {
    return withFreshToken(async () => {
      if (!isLive("addresses")) {
        await mockLatency();
        requireMockAuth();
        const updated = updateMockAddress(id, input);
        if (!updated) throw new ApiError(404, `Address ${id} not found`);
        return updated;
      }
      return request<Address>(`/addresses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    });
  },

  async deleteAddress(id: string): Promise<void> {
    return withFreshToken(async () => {
      if (!isLive("addresses")) {
        await mockLatency();
        requireMockAuth();
        if (!deleteMockAddress(id)) {
          throw new ApiError(404, `Address ${id} not found`);
        }
        return;
      }
      await request<void>(`/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    });
  },

  /* ----------------------------------------------------------- orders */

  async listOrders(status?: OrderStatus): Promise<Order[]> {
    return withFreshToken(async () => {
      if (!isLive("orders")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockOrders(status);
      }
      const page = await request<OrderPage>("/orders", {
        query: { status, per_page: 50 },
      });
      return page.data;
    });
  },

  async getOrder(id: string): Promise<Order> {
    return withFreshToken(async () => {
      if (!isLive("orders")) {
        await mockLatency(120);
        requireMockAuth();
        const order = getMockOrder(id);
        if (!order) throw new ApiError(404, `Order ${id} not found`);
        return order;
      }
      return request<Order>(`/orders/${encodeURIComponent(id)}`);
    });
  },

  async trackOrder(id: string): Promise<OrderTracking> {
    return withFreshToken(async () => {
      if (!isLive("orders")) {
        await mockLatency(120);
        requireMockAuth();
        const order = getMockOrder(id);
        if (!order) throw new ApiError(404, `Order ${id} not found`);
        return mockTrackingFor(order);
      }
      return request<OrderTracking>(`/orders/${encodeURIComponent(id)}/track`);
    });
  },

  /**
   * Validate a discount code. The contract answers 200 with the coupon or 404
   * when the code is unknown or no longer usable, so callers treat any
   * ApiError(404) as "invalid or expired" and everything else as a failure to
   * reach the service.
   */
  async validateCoupon(code: string): Promise<Coupon> {
    if (!isLive("checkout")) {
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
  async createAddress(input: AddressCreate): Promise<Address> {
    return withFreshToken(async () => {
      if (!isLive("addresses")) {
        await mockLatency();
        requireMockAuth();
        return createMockAddress(input);
      }
      return request<Address>("/addresses", {
        method: "POST",
        body: JSON.stringify(input),
      });
    });
  },

  /**
   * Place a Cash-on-Delivery order. Requires an authenticated customer — the
   * checkout gates on that before calling.
   */
  /**
   * Place the COD order.
   *
   * `idempotencyKey` is generated once per checkout attempt and replayed on
   * every retry, so a double-submit or a dropped response returns the original
   * order instead of charging the customer twice. The server answers 409 if
   * the same key arrives with a different basket, which the caller surfaces
   * rather than silently placing something else.
   */
  async placeOrder(
    body: OrderRequest,
    { idempotencyKey, draft }: { idempotencyKey?: string; draft?: OrderDraft } = {},
  ): Promise<Order> {
    return withFreshToken(async () => {
      if (!isLive("checkout")) {
        await mockLatency();
        requireMockAuth();
        const id = `order-${Date.now().toString(36)}`;
        // The contract copies the chosen address onto the order in the same
        // transaction, so the fixture does too — otherwise the detail page,
        // which reads snapshots, would show nothing after a mocked checkout.
        const chosen = getMockAddress(body.address_id);
        const order: Order = {
          id,
          order_number: nextMockOrderNumber(),
          status: "pending",
          payment_method: body.payment_method ?? "cod",
          address_id: body.address_id,
          delivery_id: `dlv-${id}`,
          subtotal: draft?.subtotal ?? 0,
          delivery_fee: draft?.delivery_fee ?? 0,
          discount: draft?.discount ?? 0,
          total: draft?.total ?? 0,
          delivery_contact_phone: chosen?.contact_phone ?? "",
          delivery_address_label: chosen?.label ?? null,
          delivery_city: chosen?.city ?? "",
          delivery_area: chosen?.area ?? null,
          delivery_street: chosen?.street ?? null,
          delivery_details: chosen?.details ?? null,
          delivery_lat: chosen?.lat ?? null,
          delivery_lng: chosen?.lng ?? null,
          placed_at: new Date().toISOString(),
          items: draft?.items ?? [],
        };
        // So the confirmation's «تتبّع الطلب» link opens a real order page.
        rememberMockOrder(order);
        return order;
      }
      return request<Order>("/orders", {
        method: "POST",
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        body: JSON.stringify({ payment_method: "cod", ...body }),
      });
    });
  },

  /* -------------------------------------------------------- wishlist */

  /**
   * The signed-in wishlist. A guest has no server wishlist at all, so the
   * store above this keeps one locally and replays it on sign-in; these three
   * methods are only ever reached with a session.
   *
   * Each row carries its whole product, priced by the server when the list is
   * read, and the page renders that as sent.
   */
  async listWishlist(): Promise<WishlistItem[]> {
    return withFreshToken(async () => {
      if (!isLive("wishlist")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockWishlist();
      }
      const page = await request<WishlistPage>("/wishlist", {
        query: { per_page: 100 },
      });
      return page.data;
    });
  },

  /** Idempotent on the server: adding a saved product returns the same row. */
  async addWishlistItem(productId: string): Promise<WishlistItem> {
    return withFreshToken(async () => {
      if (!isLive("wishlist")) {
        await mockLatency(150);
        requireMockAuth();
        return addMockWishlistItem(productId);
      }
      return request<WishlistItem>("/wishlist", {
        method: "POST",
        body: JSON.stringify({ product_id: productId }),
      });
    });
  },

  /** 404 when the product is not on the list — the store treats that as done. */
  async removeWishlistItem(productId: string): Promise<void> {
    return withFreshToken(async () => {
      if (!isLive("wishlist")) {
        await mockLatency(150);
        requireMockAuth();
        removeMockWishlistItem(productId);
        return;
      }
      // 204 No Content: nothing to parse, so this bypasses request()'s json().
      await requestNoContent(`/wishlist/${encodeURIComponent(productId)}`, {
        method: "DELETE",
      });
    });
  },

  /* --------------------------------------------------------- loyalty */

  /**
   * Points balance plus one page of the ledger.
   *
   * `points_balance` is computed by the server from the append-only ledger, so
   * it is rendered as sent. Summing the page client-side would be wrong twice
   * over: the page is one slice of the ledger, and the server's rate rules —
   * delivered subtotal less discount, excluding delivery — are not the
   * client's to reimplement.
   */
  async getLoyalty(
    { page = 1, per_page = 20 }: { page?: number; per_page?: number } = {},
  ): Promise<LoyaltyAccount> {
    return withFreshToken(async () => {
      if (!isLive("loyalty")) {
        await mockLatency(120);
        requireMockAuth();
        return getMockLoyalty({ page, per_page });
      }
      return request<LoyaltyAccount>("/loyalty", {
        query: { page, per_page },
      });
    });
  },

  /**
   * Spend points.
   *
   * The server refuses more than the balance with a 409 and an invalid amount
   * with a 422; neither is pre-judged here beyond keeping the field a positive
   * integer, because the balance can move between the page loading and the
   * button being pressed.
   */
  async redeemLoyalty(
    points: number,
    note?: string,
  ): Promise<LoyaltyRedemption> {
    return withFreshToken(async () => {
      if (!isLive("loyalty")) {
        await mockLatency();
        requireMockAuth();
        const redeemed = redeemMockLoyalty(points, note);
        // The contract's refusal for spending more than you hold.
        if (!redeemed) throw new ApiError(409, "Insufficient points balance");
        return redeemed;
      }
      return request<LoyaltyRedemption>("/loyalty/redeem", {
        method: "POST",
        body: JSON.stringify(note?.trim() ? { points, note: note.trim() } : { points }),
      });
    });
  },

  /* --------------------------------------------------------- returns */

  // MOCK: awaiting backend slice (returns).
  async createReturn(body: ReturnRequest): Promise<Return> {
    return withFreshToken(async () => {
      if (!isLive("returns")) {
        await mockLatency();
        requireMockAuth();
        return createMockReturn(body);
      }
      return request<Return>("/returns", {
        method: "POST",
        body: JSON.stringify(body),
      });
    });
  },

  /**
   * The customer's own return requests, newest first.
   *
   * GET /returns is scoped to the caller server-side — the gap noted here
   * before is closed — so there is no client-side ownership filter to get
   * wrong. Status and every refund amount come back computed.
   */
  async listReturns(status?: ReturnStatus): Promise<Return[]> {
    return withFreshToken(async () => {
      if (!isLive("returns")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockReturns();
      }
      const page = await request<ReturnPage>("/returns", {
        query: { status, per_page: 50 },
      });
      return page.data ?? [];
    });
  },

  /* --------------------------------------------- reviews & rating */

  /** A product review, which the contract ties to a purchased order item. */
  // MOCK: awaiting backend slice (reviews).
  async createReview(productId: string, body: ReviewRequest): Promise<Review> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency();
        requireMockAuth();
        return createMockReview(productId, body);
      }
      return request<Review>(
        `/products/${encodeURIComponent(productId)}/reviews`,
        { method: "POST", body: JSON.stringify(body) },
      );
    });
  },

  /**
   * Rating the delivery is a separate act from reviewing the products, and the
   * contract keeps it on its own endpoint.
   *
   * `Order.delivery_id` (contract v5.x) is what connects an order to the
   * delivery this rates — the gap noted here before is closed, and
   * lib/order-delivery.ts reads the real field. GET /deliveries/{id} is still
   * staff-scoped, but nothing customer-facing needs the record itself.
   */
  // MOCK: awaiting backend slice (reviews).
  async rateDelivery(
    deliveryId: string,
    body: DeliveryRatingRequest,
  ): Promise<DeliveryRating> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency();
        requireMockAuth();
        return createMockDeliveryRating(deliveryId, body);
      }
      return request<DeliveryRating>(
        `/deliveries/${encodeURIComponent(deliveryId)}/rating`,
        { method: "POST", body: JSON.stringify(body) },
      );
    });
  },

  /**
   * Which of an order's items the customer has already reviewed.
   *
   * Live, this is `OrderItem.reviewed` — a per-caller flag the order itself
   * carries — so the order the page already holds is the answer and there is
   * nothing to fetch. It used to call `/orders/{id}/reviewed-items`, which
   * has never existed in any version of the contract; the call only survived
   * because the domain was mocked and the live branch was unreachable.
   */
  async listReviewedOrderItems(orderId: string): Promise<string[]> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency(100);
        requireMockAuth();
        return listMockReviewedOrderItems(orderId);
      }
      const order = await request<Order>(
        `/orders/${encodeURIComponent(orderId)}`,
      );
      return (order.items ?? [])
        .filter((item) => item.reviewed)
        .map((item) => item.id ?? "")
        .filter(Boolean);
    });
  },

  /**
   * The caller's own reviews, in every moderation state, newest first.
   *
   * GET /products/{id}/reviews is public and returns only PUBLISHED rows, so
   * this is the one route on which a customer can find a review that is still
   * awaiting moderation, or was rejected — and so the one that lets edit and
   * delete survive a reload.
   */
  async listMyReviews(
    query: { page?: number; per_page?: number } = {},
  ): Promise<CustomerReviewPage> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency(100);
        requireMockAuth();
        return listMockMyReviews(query);
      }
      return request<CustomerReviewPage>("/me/reviews", { query });
    });
  },

  /**
   * Edit one of the caller's own reviews.
   *
   * A content change sends the review back to `pending` and strips its
   * moderation metadata, which the UI says out loud rather than leaving the
   * shopper to wonder why their published review vanished from the product.
   */
  async updateReview(reviewId: string, patch: ReviewPatch): Promise<Review> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency();
        requireMockAuth();
        const updated = updateMockReview(reviewId, patch);
        if (!updated) throw new ApiError(404, `Review ${reviewId} not found`);
        return updated;
      }
      return request<Review>(`/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    });
  },

  /** Delete one of the caller's own reviews; clears the line's reviewed flag. */
  async deleteReview(reviewId: string): Promise<void> {
    return withFreshToken(async () => {
      if (!isLive("reviews")) {
        await mockLatency();
        requireMockAuth();
        if (!deleteMockReview(reviewId)) {
          throw new ApiError(404, `Review ${reviewId} not found`);
        }
        return;
      }
      await requestNoContent(`/reviews/${encodeURIComponent(reviewId)}`, {
        method: "DELETE",
      });
    });
  },

  /* --------------------------------------------- notification prefs */

  /**
   * The caller's own notification preferences: every type across both
   * channels, with the server's defaults already applied.
   *
   * These are ACCOUNT-level — the contract says updates are shared by all
   * devices — so they are nothing to do with push delivery, which needs a
   * device token this web app does not mint. Flipping the preferences does not
   * make the browser receive push; see the README.
   */
  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return withFreshToken(async () => {
      if (!isLive("notifications")) {
        await mockLatency(120);
        requireMockAuth();
        return getMockNotificationPreferences();
      }
      return request<NotificationPreferences>("/me/notification-preferences");
    });
  },

  /**
   * Update some of them. Omitted pairs are left alone, so this sends only the
   * toggles that actually moved; the server answers with the full effective
   * set, which is what the UI then renders.
   */
  async updateNotificationPreferences(
    preferences: NotificationPreferenceEntry[],
  ): Promise<NotificationPreferences> {
    return withFreshToken(async () => {
      if (!isLive("notifications")) {
        await mockLatency();
        requireMockAuth();
        return updateMockNotificationPreferences(preferences);
      }
      return request<NotificationPreferences>("/me/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({ preferences }),
      });
    });
  },

  /* ------------------------------------------- order monitor (6.1) */

  /**
   * The order monitor's read-only list. Everything is filtered and paged on
   * the server, and `status_counts` is counted without the status filter so
   * every chip keeps its number while one is selected. `signal` lets a search
   * box cancel the request its previous keystroke started.
   */
  async listMonitorOrders(
    query: MonitorOrderQuery,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<MonitorOrderPage> {
    return withFreshToken(async () => {
      if (!isLive("monitor")) {
        await mockLatency(120);
        requireMockAuth();
        signal?.throwIfAborted();
        return listMockMonitorOrders(query, STORE_TIME_ZONE);
      }
      return request<MonitorOrderPage>("/monitor/orders", {
        query: { ...query },
        signal,
      });
    });
  },

  /** One order for the monitor: no product images, nothing to act on. */
  async getMonitorOrder(id: string): Promise<MonitorOrderDetail> {
    return withFreshToken(async () => {
      if (!isLive("monitor")) {
        await mockLatency(120);
        requireMockAuth();
        const order = getMockMonitorOrder(id);
        if (!order) throw new ApiError(404, `Order ${id} not found`);
        return order;
      }
      return request<MonitorOrderDetail>(
        `/monitor/orders/${encodeURIComponent(id)}`,
      );
    });
  },

  /* ------------------------------------------- delivery agent (6.1) */

  /** The signed-in agent's own deliveries, newest dispatch first. */
  async listAssignedDeliveries(
    query: { status?: DeliveryStatus; page?: number; per_page?: number } = {},
  ): Promise<DeliveryPage> {
    return withFreshToken(async () => {
      if (!isLive("deliveries")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockDeliveries(
          query.status,
          query.page ?? 1,
          query.per_page ?? 20,
        );
      }
      return request<DeliveryPage>("/deliveries/assigned", { query });
    });
  },

  /**
   * Move one of the agent's deliveries along. The server owns the transition
   * table and answers 409 when the delivery (or its order) has moved on.
   */
  async updateDeliveryStatus(
    id: string,
    status: Exclude<DeliveryStatus, "assigned">,
  ): Promise<Delivery> {
    return withFreshToken(async () => {
      if (!isLive("deliveries")) {
        await mockLatency();
        requireMockAuth();
        const updated = updateMockDelivery(id, status);
        if (updated === null) throw new ApiError(404, "Delivery not found");
        if (updated === "conflict") {
          throw new ApiError(409, "Delivery status transition is not allowed", "CONFLICT");
        }
        return updated;
      }
      return request<Delivery>(`/deliveries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    });
  },

  /* ---------------------------------------- notification inbox (6.1) */

  /** The caller's saved notifications, newest first. */
  async listNotifications(
    query: { page?: number; per_page?: number; unread?: boolean } = {},
  ): Promise<NotificationPage> {
    return withFreshToken(async () => {
      if (!isLive("inbox")) {
        await mockLatency(120);
        requireMockAuth();
        return listMockInbox(
          query.page ?? 1,
          query.per_page ?? 20,
          query.unread ?? false,
        );
      }
      return request<NotificationPage>("/me/notifications", {
        // `unread=false` is the server's default; sending it only when set
        // keeps the URL honest about which filter is on.
        query: { ...query, unread: query.unread || undefined },
      });
    });
  },

  async getUnreadCount(): Promise<number> {
    return withFreshToken(async () => {
      if (!isLive("inbox")) {
        await mockLatency(60);
        requireMockAuth();
        return mockUnreadCount();
      }
      const body = await request<{ unread_count: number }>(
        "/me/notifications/unread-count",
      );
      return body.unread_count;
    });
  },

  async markNotificationRead(
    id: string,
  ): Promise<{ id: string; read_at: string }> {
    return withFreshToken(async () => {
      if (!isLive("inbox")) {
        await mockLatency(80);
        requireMockAuth();
        const result = markMockRead(id);
        if (!result) throw new ApiError(404, "Notification not found");
        return result;
      }
      return request<{ id: string; read_at: string }>(
        `/me/notifications/${encodeURIComponent(id)}/read`,
        { method: "PATCH" },
      );
    });
  },

  async markAllNotificationsRead(): Promise<{
    updated: number;
    read_at: string;
  }> {
    return withFreshToken(async () => {
      if (!isLive("inbox")) {
        await mockLatency(80);
        requireMockAuth();
        return markAllMockRead();
      }
      return request<{ updated: number; read_at: string }>(
        "/me/notifications/read-all",
        { method: "PATCH" },
      );
    });
  },

  /**
   * A single-use, 60-second ticket for one SSE connection. The bearer token
   * travels only on this POST; the stream URL carries the ticket instead, so
   * the token never lands in a URL, a proxy log or the browser history.
   */
  async createStreamTicket(): Promise<StreamTicket> {
    return withFreshToken(async () => {
      requireAuthenticated();
      return request<StreamTicket>("/notifications/stream-ticket", {
        method: "POST",
      });
    });
  },

  /** Where to point the EventSource; `since` resumes after that event id. */
  notificationStreamUrl(ticket: string, since?: string | null): string {
    return buildUrl("/notifications/stream", {
      ticket,
      since: since ?? undefined,
    });
  },

  /* ------------------------------------------------------------- cart */

  /**
   * The signed-in cart, repriced by the server on every read.
   *
   * A guest has no server cart at all — the contract is explicit that guest
   * carts stay client-side and are replayed through POST /cart/items after
   * login — so these methods are only ever reached with a session. The
   * response is the authority: prices, availability and every total come back
   * computed, and the store adopts them verbatim rather than recomputing.
   */
  async getCart(): Promise<Cart> {
    return withFreshToken(async () => {
      requireAuthenticated();
      return request<Cart>("/cart");
    });
  },

  async addCartItem(input: {
    product_id: string;
    variant_id?: string | null;
    quantity: number;
  }): Promise<Cart> {
    return withFreshToken(async () => {
      requireAuthenticated();
      return request<Cart>("/cart/items", {
        method: "POST",
        body: JSON.stringify({
          product_id: input.product_id,
          variant_id: input.variant_id ?? null,
          quantity: input.quantity,
        }),
      });
    });
  },

  async updateCartItem(itemId: string, quantity: number): Promise<Cart> {
    return withFreshToken(async () => {
      requireAuthenticated();
      return request<Cart>(`/cart/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
    });
  },

  /**
   * Detach the coupon from the server cart and get it back repriced.
   *
   * Added by contract v5.1.0 (DELETE /cart/coupon). Before it existed the
   * signed-in UI had to hide the "remove" control, because taking a coupon
   * off was something only the server could do and no route did it. The
   * contract calls the endpoint safe to repeat when no coupon is applied, so
   * the caller never has to check first.
   */
  async removeCartCoupon(): Promise<Cart> {
    return withFreshToken(async () => {
      requireAuthenticated();
      return request<Cart>("/cart/coupon", { method: "DELETE" });
    });
  },

  /**
   * Remove one line. The contract has no "empty the cart" route, so clearing
   * is this called per line — which is also what placing an order makes
   * unnecessary, since the server consumes the cart itself.
   */
  async removeCartItem(itemId: string): Promise<void> {
    return withFreshToken(async () => {
      requireAuthenticated();
      await requestNoContent(`/cart/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
    });
  },

  /* ----------------------------------------------------------- orders */

  /**
   * Cancel an order the customer still may cancel.
   *
   * The server decides: pending and confirmed are cancellable, anything later
   * answers 409, which the caller surfaces rather than guessing from status.
   */
  async cancelOrder(id: string): Promise<Order> {
    return withFreshToken(async () => {
      if (!isLive("orders")) {
        await mockLatency();
        requireMockAuth();
        const order = getMockOrder(id);
        if (!order) throw new ApiError(404, `Order ${id} not found`);
        if (order.status !== "pending" && order.status !== "confirmed") {
          throw new ApiError(409, "Status does not allow cancellation");
        }
        order.status = "cancelled";
        return order;
      }
      return request<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
      });
    });
  },

  /** Published reviews, paginated with the shared Pagination envelope. */
  async listReviews(
    id: string,
    { page = 1, per_page = 5 }: { page?: number; per_page?: number } = {},
  ): Promise<ReviewPage> {
    if (!isLive("catalog")) {
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
