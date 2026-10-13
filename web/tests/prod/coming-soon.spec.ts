import { expect, test } from "@playwright/test";
import { CLOSED_PREVIEW_TOKEN } from "./closed-store";

/**
 * Before opening day (STORE_PUBLIC=false), on the production build: every
 * store address shows the branded "opening soon" page, unindexed and
 * uncached; robots.txt shuts crawlers out and the sitemap is empty; the
 * health check still answers. The owner's preview link opens the real store
 * under a preview banner, a wrong token changes nothing, and "end preview"
 * closes it again.
 */
const closed = process.env.PLAYWRIGHT_CLOSED_ORIGIN ?? "http://localhost:3103";

test.use({ baseURL: closed });

for (const [path, lang, title] of [
  ["/", "ar", "نفتح قريبًا"],
  ["/categories", "ar", "نفتح قريبًا"],
  ["/product/00000000-0000-4000-8000-000000000000", "ar", "نفتح قريبًا"],
  ["/checkout", "ar", "نفتح قريبًا"],
  ["/en", "en", "Opening soon"],
  ["/en/cart", "en", "Opening soon"],
] as const) {
  test(`closed store: ${path} is the opening-soon page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const headers = response!.headers();
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["content-security-policy"]).toContain("'nonce-");
    await expect(page.getByTestId("coming-soon")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // Nothing of the shop: no header, cart or sign-in.
    await expect(page.locator("header")).toHaveCount(0);
  });
}

test("closed store: robots.txt and the sitemap keep crawlers out; health still answers", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
  expect(robots).not.toContain("Allow: /");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("<loc>");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
});

test("closed store: a wrong preview token is just the opening-soon page", async ({ page, context }) => {
  await page.goto("/preview?t=not-the-token-at-all-000000");
  await expect(page.getByTestId("coming-soon")).toBeVisible();
  expect((await context.cookies()).find((cookie) => cookie.name === "shubayr_store_preview")).toBeUndefined();
});

test("closed store: the preview link opens the real store until the preview ends", async ({ page, context }) => {
  await page.goto(`/preview?t=${CLOSED_PREVIEW_TOKEN}`);
  await expect(page).toHaveURL(`${closed}/`);
  const cookie = (await context.cookies()).find((entry) => entry.name === "shubayr_store_preview");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  // The cookie holds the token's hash, never the token.
  expect(cookie?.value).toMatch(/^[0-9a-f]{64}$/);
  expect(cookie?.value).not.toContain(CLOSED_PREVIEW_TOKEN);

  await expect(page.getByTestId("store-preview-banner")).toBeVisible();
  await expect(page.getByTestId("coming-soon")).toHaveCount(0);
  await expect(page.locator("header").first()).toBeVisible();
  const response = await page.goto("/categories");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByTestId("store-preview-banner")).toBeVisible();

  await page.getByTestId("store-preview-exit").click();
  await expect(page.getByTestId("coming-soon")).toBeVisible();
  expect((await context.cookies()).find((entry) => entry.name === "shubayr_store_preview")).toBeUndefined();
});

test("closed store: a forged gate header from the client changes nothing", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-store-gate": "preview" });
  await page.goto("/");
  await expect(page.getByTestId("coming-soon")).toBeVisible();
  await expect(page.getByTestId("store-preview-banner")).toHaveCount(0);
});
