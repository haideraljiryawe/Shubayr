import { expect, test, type Page } from "@playwright/test";

/**
 * The production storefront as a crawler, a browser and an attacker see it.
 * See playwright.prod.config.ts for how the build is made.
 */

const SITE = process.env.PLAYWRIGHT_PROD_SITE ?? "http://localhost:3102";
const PRODUCT = "p1";
const CATEGORY = "electronics";

function directive(csp: string, name: string): string {
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";
}

/** Load a page and collect any CSP violation the browser reports. */
async function visit(page: Page, path: string) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const response = await page.goto(path);
  await page.waitForLoadState("networkidle");
  return { response: response!, violations };
}

test.describe("security headers", () => {
  test("every page carries a strict, nonce-based CSP and the hardening headers", async ({ request }) => {
    for (const path of ["/", `/product/${PRODUCT}`, `/category/${CATEGORY}`, "/cart", "/en"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const headers = response.headers();
      const csp = headers["content-security-policy"];
      expect(csp, path).toBeTruthy();
      const scripts = directive(csp, "script-src");
      expect(scripts).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
      expect(scripts).toContain("'strict-dynamic'");
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(scripts).not.toContain("'unsafe-eval'");
      expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
      expect(directive(csp, "object-src")).toBe("object-src 'none'");
      expect(headers["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(headers["x-powered-by"]).toBeUndefined();
    }
  });

  test("personal pages are never cacheable: cart, checkout, account, agent and monitor pages are no-store", async ({ request }) => {
    // The session lives in the browser and these pages read the shopper's
    // data from there; the HTML itself must still never be kept by a proxy
    // or the browser, so one person's page is never shown to another.
    const personal = [
      "/cart",
      "/checkout",
      "/account",
      "/account/orders",
      "/account/addresses",
      "/account/points",
      "/account/wishlist",
      "/account/profile",
      "/account/returns",
      "/notifications",
      "/deliveries",
      "/deliveries/custody",
      "/monitor/orders",
      "/en/account",
    ];
    for (const path of personal) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["cache-control"] ?? "", path).toMatch(/no-store/);
      expect(response.headers()["cache-control"] ?? "", path).not.toMatch(/\bpublic\b|s-maxage/);
    }
  });

  test("each response has its own nonce, and every script in the page carries it", async ({ request }) => {
    const first = await request.get("/");
    const second = await request.get("/");
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)![1];
    const nonce = nonceOf(first.headers()["content-security-policy"]);
    expect(nonce).not.toBe(nonceOf(second.headers()["content-security-policy"]));
    const html = await first.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toContain(`nonce="${nonce}"`);
  });

  test("pages hydrate under the CSP with no violation", async ({ page }) => {
    for (const path of ["/", `/category/${CATEGORY}`, `/product/${PRODUCT}`, "/cart", "/checkout"]) {
      const { violations } = await visit(page, path);
      expect(violations, path).toEqual([]);
    }
    // Hydrated: a client-side interaction works (add to cart updates the badge).
    await visit(page, `/product/${PRODUCT}`);
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await expect(page.getByTestId("cart-badge")).toHaveText("1");
  });

  test("Zain is self-hosted: its real faces load from this origin, never from Google", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (sent) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(sent.url())) external.push(sent.url());
    });
    const { violations } = await visit(page, "/");
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replace(/["']/g, ""));
    });
    // NOTE-009: Zain regular and bold, from this origin; no Cairo in the store.
    expect(loaded).toContain("zain");
    expect(loaded.some((family) => /cairo/i.test(family))).toBe(false);
    expect(external).toEqual([]);
    expect(violations).toEqual([]);
    // Only the faces every page shows above the fold are preloaded (400, 700).
    const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(preloads).toHaveLength(2);
    expect(preloads.every((href) => /zain_(400|700)/.test(href ?? ""))).toBe(true);
    // Real weights only: what the page asks for is 400 or 700, never synthesised.
    const body = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { family: style.fontFamily, synthesis: style.getPropertyValue("font-synthesis-weight") };
    });
    expect(body.family).toMatch(/zain/);
    expect(body.synthesis).toBe("none");
  });

  test("no source maps are served", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const chunk = /\/_next\/static\/chunks\/[^"']+\.js/.exec(html)![0];
    expect((await request.get(chunk)).status()).toBe(200);
    expect((await request.get(`${chunk}.map`)).status()).toBe(404);
  });
});

test.describe("search engines", () => {
  test("robots.txt opens the catalog, closes private pages and points at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    for (const path of ["/account", "/cart", "/checkout", "/login", "/en/account", "/api/"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    // The one /account page that is public: the app stores link to it.
    expect(body).toContain("Allow: /account/delete");
    expect(body).toContain("Allow: /en/account/delete");
    expect(body).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test("sitemap.xml lists home, visible categories and brands, and products, with alternates", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toContain(`${SITE}/`);
    expect(locs).toContain(`${SITE}/category/${CATEGORY}`);
    expect(locs).toContain(`${SITE}/product/${PRODUCT}`);
    expect(locs.some((loc) => loc.includes("/search?brand_id=brand-sonic"))).toBe(true);
    // The hidden brand of the fixtures is left out.
    expect(locs.some((loc) => loc.includes("brand-retired"))).toBe(false);
    expect(xml).toContain(`hreflang="en" href="${SITE}/en/product/${PRODUCT}"`);
    for (const path of ["/privacy", "/terms", "/returns", "/support", "/account/delete"]) expect(locs).toContain(`${SITE}${path}`);
    for (const loc of locs) expect(loc.startsWith(SITE)).toBe(true);
  });

  test("a product page: Arabic metadata, canonical, Open Graph and valid Product structured data", async ({ page }) => {
    await page.goto(`/product/${PRODUCT}?variant=anything`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await page.title()).toMatch(/[؀-ۿ]/);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toMatch(/[؀-ۿ]/);
    // One canonical URL per product, whatever the query.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/product/${PRODUCT}`);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `${SITE}/en/product/${PRODUCT}`);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "ar_IQ");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${SITE}/product/${PRODUCT}`);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /^https?:\/\//);

    const raw = await page.locator('script[type="application/ld+json"][data-testid="product-jsonld"]').textContent();
    const data = JSON.parse(raw!);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("Product");
    expect(data.name).toMatch(/[؀-ۿ]/);
    expect(data.url).toBe(`${SITE}/product/${PRODUCT}`);
    expect(Array.isArray(data.image) && data.image.length > 0).toBe(true);
    expect(["Offer", "AggregateOffer"]).toContain(data.offers["@type"]);
    expect(data.offers.priceCurrency).toBe("IQD");
    expect(data.offers.availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock|LimitedAvailability)$/);
    const price = data.offers.price ?? data.offers.lowPrice;
    expect(typeof price).toBe("number");
    expect(price).toBeGreaterThan(0);
  });

  test("category and home pages carry their canonical URL; private pages are noindex", async ({ page }) => {
    await page.goto(`/category/${CATEGORY}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/category/${CATEGORY}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /[؀-ۿ]/);
    await page.goto("/");
    // The root: Next.js prints it without the trailing slash (the same URL).
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`^${SITE}/?$`));
    await page.goto("/en");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/en`);
    for (const path of ["/cart", "/checkout", "/login"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(0);
    }
  });
});

test.describe("legal and support pages", () => {
  for (const path of ["/privacy", "/terms", "/returns", "/support", "/account/delete"]) {
    test(`${path} is indexable once the store is public, with its canonical URL`, async ({ page }) => {
      const { response, violations } = await visit(page, path);
      expect(response.status()).toBe(200);
      expect(response.headers()["x-robots-tag"]).toBeUndefined();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow$/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}${path}`);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `${SITE}/en${path}`);
      await expect(page.getByTestId("info-shell")).toHaveCount(0);
      await expect(page.getByTestId("header-cart")).toBeVisible();
      expect(violations).toEqual([]);
    });
  }
});

test.describe("error states", () => {
  test("an unknown page is a real 404, in Arabic, inside the store", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response!.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByTestId("not-found")).toContainText("الصفحة غير موجودة");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const english = await page.goto("/en/no-such-page");
    expect(english!.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toContainText("Page not found");
    // A product that doesn't exist is a 404 too.
    expect((await page.goto("/product/no-such-product"))!.status()).toBe(404);
  });

  test("offline: the store says so instead of failing silently", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.getByTestId("offline-notice")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByTestId("offline-notice")).toHaveCount(0);
  });

  test("the health endpoint answers", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
