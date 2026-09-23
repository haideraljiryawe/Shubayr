import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Smoke test against the REAL backend.
 *
 * Runs only when the API is actually reachable, so the rest of the suite stays
 * hermetic and CI without a backend simply skips this file. Start the stack
 * with `docker compose --profile full up -d` and seed it, then `npm test`.
 *
 * It calls the API directly rather than through a page, for two reasons: it is
 * the contract that is under test here, not the rendering, and a Node-side
 * request is not subject to the browser's CORS rules — which are scoped to the
 * dev-server origin and would otherwise make this fail for the wrong reason.
 */

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function reachable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${API}/settings`, { timeout: 3000 });
    return response.ok();
  } catch {
    return false;
  }
}

test.describe("live catalog", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await reachable(request)),
      `No API at ${API} — start the backend to run the live smoke test.`,
    );
  });

  test("serves the seeded department tree with localized names", async ({
    request,
  }) => {
    const categories = await (await request.get(`${API}/categories`)).json();

    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);

    const root = categories[0];
    // Contract v4.5.0 names: visibility is is_visible, and the icon is a
    // semantic key rather than a framework icon name.
    expect(root).toHaveProperty("is_visible");
    expect(root).toHaveProperty("icon_key");
    expect(root).not.toHaveProperty("is_active");
    expect(root.name_ar?.length).toBeGreaterThan(0);
    expect(root.name_en?.length).toBeGreaterThan(0);
    // Departments carry their subcategories inline.
    expect(Array.isArray(root.children)).toBe(true);
    expect(root.children.length).toBeGreaterThan(0);
  });

  test("computes effective pricing on the server, not the client", async ({
    request,
  }) => {
    const page = await (
      await request.get(`${API}/products?per_page=100`)
    ).json();

    expect(page.total).toBeGreaterThan(0);

    for (const product of page.data) {
      // The v4 pricing model: a regular price plus backend-computed fields.
      expect(product).toHaveProperty("price");
      expect(product).toHaveProperty("on_sale");
      expect(product).toHaveProperty("effective_price");
      expect(product).not.toHaveProperty("sale_price");
      expect(product).not.toHaveProperty("compare_at_price");

      if (product.on_sale) {
        expect(product.effective_price).toBeLessThan(product.price);
        expect(product.discount_percent).toBeGreaterThan(0);
      } else {
        expect(product.effective_price).toBe(product.price);
        expect(product.discounted_price).toBeNull();
      }
    }

    // Product images are objects now, not bare URLs.
    const withImages = page.data.find(
      (product: { images?: unknown[] }) => (product.images ?? []).length > 0,
    );
    expect(withImages, "seed should carry product imagery").toBeTruthy();
    expect(withImages.images[0]).toHaveProperty("url");
    expect(withImages.images[0]).toHaveProperty("is_primary");
  });

  test("honours a scheduled discount window against server time", async ({
    request,
  }) => {
    const page = await (
      await request.get(`${API}/products?per_page=100`)
    ).json();

    const scheduled = page.data.filter(
      (product: { discount_starts_at: string | null }) =>
        product.discount_starts_at !== null,
    );
    expect(
      scheduled.length,
      "seed should carry at least one scheduled discount",
    ).toBeGreaterThan(0);

    const now = Date.now();
    for (const product of scheduled) {
      const starts = new Date(product.discount_starts_at).getTime();
      const ends = product.discount_ends_at
        ? new Date(product.discount_ends_at).getTime()
        : Infinity;
      // Whatever the clock says, the server's answer must agree with it — a
      // window that has not opened yet must not be discounted.
      expect(product.on_sale).toBe(now >= starts && now <= ends);
    }
  });

  test("?on_sale=true returns only currently discounted products", async ({
    request,
  }) => {
    const page = await (
      await request.get(`${API}/products?on_sale=true&per_page=100`)
    ).json();

    for (const product of page.data) {
      expect(product.on_sale).toBe(true);
      expect(product.effective_price).toBeLessThan(product.price);
    }
  });

  test("serves active banners for the home hero", async ({ request }) => {
    const banners = await (await request.get(`${API}/banners`)).json();

    expect(Array.isArray(banners)).toBe(true);
    expect(banners.length).toBeGreaterThan(0);
    for (const banner of banners) {
      expect(banner.is_active).toBe(true);
      expect(banner.image_url).toMatch(/^https?:\/\//);
    }
  });

  test("signs the seeded customer in with the dev OTP", async ({ request }) => {
    const phone = "+9647700000006";

    const requested = await request.post(`${API}/auth/request-otp`, {
      data: { phone },
    });
    expect(requested.ok()).toBe(true);

    const verified = await request.post(`${API}/auth/verify-otp`, {
      data: { phone, code: process.env.DEV_OTP ?? "000000" },
    });
    expect(verified.ok()).toBe(true);

    const tokens = await verified.json();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    // The token actually authenticates GET /me.
    const me = await request.get(`${API}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(me.ok()).toBe(true);
    expect((await me.json()).phone).toBe(phone);
  });
});
