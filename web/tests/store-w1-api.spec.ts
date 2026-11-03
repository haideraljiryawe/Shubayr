import { expect, test } from "@playwright/test";
import type { components } from "../src/types/api";
import { mockAvailabilityFor, mockCategories, mockProducts, mockSettings } from "../src/lib/mock-data";
import { FakeApi, signInAs } from "./fake-api";

/**
 * PR W1 against a scripted API (WORK_TESTS=true): the store reads the real
 * 17.7.0 shapes — contract banners and their actions, an image that fails, a
 * failed feed, Recently Added on / off / empty — and turns the server's
 * PRODUCT_ORDER_LIMIT_EXCEEDED into words on add-to-cart and cart update.
 */

type ApiBanner = components["schemas"]["Banner"];
type Cart = components["schemas"]["Cart"];

const api = new FakeApi();
const ART =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#2f6b3f"/></svg>');
const BROKEN = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 3101}/missing-banner.png`;

function banner(over: Partial<ApiBanner> & { id: string }): ApiBanner {
  return {
    title: "Legacy",
    subtitle: null,
    image_url: ART,
    cta_text: null,
    link_url: null,
    internal_name: over.id,
    title_ar: "عنوان",
    title_en: "Title",
    subtitle_ar: null,
    subtitle_en: null,
    cta_label_ar: null,
    cta_label_en: null,
    show_text: true,
    action_type: "none",
    action_target_id: null,
    action: { type: "none", url: null, target: null },
    is_default: false,
    default_priority: 0,
    sort_order: 0,
    is_active: true,
    effective_status: "active",
    starts_at: null,
    ends_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

const target = (id: string, slug: string | null, available: boolean) => ({ id, slug, name_ar: "هدف", name_en: "Target", available });

const FEED: ApiBanner[] = [
  banner({
    id: "image-only-product",
    show_text: false,
    title_ar: "صورة فقط",
    title_en: "Image only",
    action_type: "product",
    action_target_id: "p11",
    action: { type: "product", url: null, target: target("p11", null, true) },
  }),
  banner({
    id: "category-button",
    // Arabic missing: the English title stands in (the contract's fallback order).
    title_ar: "",
    title_en: "Kitchen",
    cta_label_en: "Browse",
    action_type: "category",
    action_target_id: "c2",
    action: { type: "category", url: null, target: target("c2", "home-kitchen", true) },
  }),
  banner({
    id: "unavailable-product",
    title_en: "Gone",
    action_type: "product",
    action_target_id: "p99",
    action: { type: "product", url: null, target: target("p99", null, false) },
  }),
  banner({ id: "broken-image", title_en: "Broken art", image_url: BROKEN }),
  banner({
    id: "external",
    title_en: "Partner",
    link_url: "https://partner.example/offer",
    action_type: "url",
    action: { type: "url", url: "https://partner.example/offer", target: null },
  }),
];

const page = (data: unknown[]) => ({ data, total: data.length, page: 1, per_page: Math.max(1, data.length) });
const p11 = mockProducts.find((product) => product.id === "p11")!;

function catalog(settings: Record<string, unknown> = {}) {
  api
    .on("GET", /^\/settings$/, () => ({ body: { ...mockSettings, ...settings } }))
    .on("GET", /^\/categories$/, () => ({ body: mockCategories }))
    .on("GET", /^\/banners$/, () => ({ body: FEED }))
    .on("GET", /^\/products$/, () => ({ body: page(mockProducts.slice(0, 5)) }))
    .on("GET", /^\/products\/p11$/, () => ({ body: p11 }))
    .on("GET", /^\/products\/p11\/availability$/, () => ({ body: mockAvailabilityFor(p11 as Parameters<typeof mockAvailabilityFor>[0]) }))
    .on("GET", /^\/products\/p11\/reviews$/, () => ({ body: { data: [], total: 0, page: 1, per_page: 1 } }));
}

function serverCart(quantity: number): Cart {
  const unit = p11.effective_price ?? p11.price ?? 0;
  return {
    id: "cart-1",
    items: quantity
      ? [
          {
            id: "item-1",
            product_id: "p11",
            variant_id: "p11-40",
            quantity,
            unit_price: unit,
            price_version: "v1",
            current_unit_price: unit,
            current_price_version: "v1",
            price_changed: false,
            line_total: unit * quantity,
            currency: "USD",
            available: true,
            available_qty: 6,
          },
        ]
      : [],
    subtotal: unit * quantity,
    discount: 0,
    coupon_discount: 0,
    tier_discount: 0,
    discount_source: "none",
    applied_tier: null,
    next_tier: null,
    delivery_fee: 0,
    total: unit * quantity,
    coupon_code: null,
    currency: "USD",
  } as Cart;
}

const refusal = (allowed: number, requested: number) => ({
  status: 409,
  body: {
    status: 409,
    code: "PRODUCT_ORDER_LIMIT_EXCEEDED",
    message: "Per-order limit exceeded",
    errors: [],
    details: { product_id: "p11", allowed_quantity: allowed, requested_quantity: requested },
  },
});

test.beforeAll(async () => api.start());
test.afterAll(async () => api.stop());
test.beforeEach(() => api.reset());

test.describe("home banners from the contract (NOTE-001)", () => {
  test("actions, fallback text, image-only, unavailable target and a failed image", async ({ page: browser }) => {
    catalog();
    await browser.goto("/en");
    const slides = browser.getByTestId("hero-banner");
    // Off-screen artwork loads only when its slide comes into view (no eager
    // downloads). Go to the slide whose picture fails: it is dropped rather
    // than shown broken, and the other four stay, in the feed's order.
    await expect(slides).toHaveCount(5);
    await browser.getByRole("button", { name: "Go to slide 4" }).click();
    await expect(slides).toHaveCount(4);
    await expect(browser.getByText("Broken art")).toHaveCount(0);
    await expect(slides.nth(0)).toHaveAttribute("data-show-text", "false");
    await expect(slides.nth(0).getByTestId("hero-card-link")).toHaveAttribute("href", "/en/product/p11");
    await expect(slides.nth(1).getByTestId("hero-cta")).toHaveText("Browse");
    await expect(slides.nth(1).getByTestId("hero-cta")).toHaveAttribute("href", "/en/category/home-kitchen");
    // A product the shopper can no longer see: shown, but not clickable.
    await expect(slides.nth(2)).toHaveAttribute("data-action", "none");
    await expect(slides.nth(2).locator("a")).toHaveCount(0);
    const external = slides.nth(3).getByTestId("hero-card-link");
    await expect(external).toHaveAttribute("href", "https://partner.example/offer");
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", "noopener noreferrer");

    await browser.goto("/");
    await expect(browser.getByTestId("hero-banner").nth(1).getByTestId("hero-title")).toHaveText("Kitchen");
    await expect(browser.getByTestId("hero-banner").nth(0).getByTestId("hero-card-link")).toHaveAttribute("href", "/product/p11");
  });

  test("a failed feed leaves the rest of the home page working, with no banner made up", async ({ page: browser }) => {
    catalog();
    api.on("GET", /^\/banners$/, () => ({ status: 500, body: { code: "INTERNAL_ERROR", message: "down" } }));
    await browser.goto("/en");
    await expect(browser.getByText(mockCategories[0].name_en ?? "Electronics").first()).toBeVisible();
    await expect(browser.getByTestId("hero-banner")).toHaveCount(0);
  });
});

test.describe("Recently Added (NOTE-004)", () => {
  test("on: the server's newest-first products, as many as the owner allows", async ({ page: browser }) => {
    catalog({ recently_added_enabled: true, recently_added_max_count: 2 });
    const [newest, next] = [mockProducts[6], mockProducts[3]];
    api.on("GET", /^\/products\/recently-added$/, () => ({ body: page([newest, next]) }));
    await browser.goto("/en");
    const recent = browser.getByTestId("recently-added");
    await expect(recent).toHaveAttribute("data-count", "2");
    await expect(recent).toContainText("Recently added");
    const names = recent.locator('a[href*="/product/"]');
    await expect(names.first()).toHaveAttribute("href", `/en/product/${newest.id}`);
    expect(api.requests("GET", /^\/products\/recently-added$/).at(-1)?.query.get("per_page")).toBe("2");
    await expect(browser.getByTestId("new-arrivals")).toHaveCount(0);
  });

  test("off or empty: hidden, and the home page is as before", async ({ page: browser }) => {
    catalog({ recently_added_enabled: false });
    await browser.goto("/en");
    await expect(browser.getByTestId("new-arrivals")).toBeVisible();
    await expect(browser.getByTestId("recently-added")).toHaveCount(0);
    expect(api.requests("GET", /^\/products\/recently-added$/)).toHaveLength(0);

    api.reset();
    catalog({ recently_added_enabled: true, recently_added_max_count: 10 });
    api.on("GET", /^\/products\/recently-added$/, () => ({ body: page([]) }));
    await browser.goto("/en");
    await expect(browser.getByTestId("new-arrivals")).toBeVisible();
    await expect(browser.getByTestId("recently-added")).toHaveCount(0);
  });
});

test.describe("per-order maximum refused by the server (NOTE-011)", () => {
  test("add-to-cart and a cart change are worded with the allowed and requested quantities", async ({ page: browser }) => {
    catalog();
    let quantity = 2;
    api
      .on("GET", /^\/cart$/, () => ({ body: serverCart(quantity) }))
      .on("POST", /^\/cart\/items$/, () => refusal(2, 3))
      .on("PATCH", /^\/cart\/items\/item-1$/, () => refusal(2, 3))
      .on("GET", /^\/wishlist/, () => ({ body: page([]) }));
    await signInAs(browser, "customer");

    // The server cart already holds 2 pairs; the page allows one more, the server says no.
    await browser.goto("/en/product/p11");
    await expect(browser.getByTestId("purchase-limit-in-cart")).toBeVisible();
    await browser.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await expect(browser.getByText("You can order at most 2 pcs of this product per order (you asked for 3).")).toBeVisible();
    await expect(browser.getByText("PRODUCT_ORDER_LIMIT_EXCEEDED")).toHaveCount(0);

    await browser.goto("/en/cart");
    const row = browser.getByTestId("cart-items").locator("li").first();
    await row.locator('button[aria-label="Increase quantity"]').click();
    await expect(browser.getByText("You can order at most 2 pcs of this product per order (you asked for 3).")).toBeVisible();
    quantity = 2;
    await expect(row.locator('[data-testid="quantity-input"]')).toHaveValue("2");
  });
});
