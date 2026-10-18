import { expect, test } from "@playwright/test";

/**
 * Before opening day (STORE_PUBLIC=false), on the production build: every
 * store address shows the branded "opening soon" page, unindexed and
 * uncached; robots.txt shuts crawlers out and the sitemap is empty; the
 * health check still answers. The owner's preview link opens the real store
 * under a preview banner, a wrong token changes nothing, and "end preview"
 * closes it again.
 */
const closed = process.env.PLAYWRIGHT_CLOSED_ORIGIN ?? "http://localhost:3103";
const CLOSED_PREVIEW_TOKEN = process.env.PLAYWRIGHT_CLOSED_PREVIEW_TOKEN ?? "";

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
  expect(CLOSED_PREVIEW_TOKEN, "set by playwright.prod.config.ts").not.toBe("");
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

// The legal, support and account deletion pages stay open before opening day
// (src/lib/store-gate.ts, INFO_PATHS): the app stores need their addresses.
for (const [path, lang, title] of [
  ["/privacy", "ar", "سياسة الخصوصية"],
  ["/terms", "ar", "شروط الاستخدام"],
  ["/returns", "ar", "سياسة الإرجاع والاسترداد"],
  ["/support", "ar", "اتصل بنا"],
  ["/account/delete", "ar", "حذف الحساب"],
  ["/en/privacy", "en", "Privacy policy"],
  ["/en/terms", "en", "Terms of use"],
  ["/en/returns", "en", "Returns & refunds"],
  ["/en/support", "en", "Contact us"],
  ["/en/account/delete", "en", "Delete your account"],
] as const) {
  test(`closed store: ${path} stays reachable, unindexed until opening`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const headers = response!.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["content-security-policy"]).toContain("'nonce-");
    await expect(page.getByTestId("coming-soon")).toHaveCount(0);
    await expect(page.getByTestId("info-shell")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // The footer's policy links, but none of the shop behind the gate.
    await expect(page.getByTestId("site-footer").getByTestId("policy-link-privacy")).toBeVisible();
    await expect(page.getByTestId("header-cart")).toHaveCount(0);
    await expect(page.getByTestId("header-login")).toHaveCount(0);
  });
}

test("closed store: the rest of /account stays behind the gate", async ({ page }) => {
  for (const path of ["/account", "/account/orders", "/en/account/profile", "/login"]) {
    await page.goto(path);
    await expect(page.getByTestId("coming-soon"), path).toBeVisible();
  }
});

test("closed store: the opening-soon page links to privacy, terms and support", async ({ page }) => {
  await page.goto("/");
  const links = page.getByTestId("coming-soon-policies");
  await expect(links.getByTestId("policy-link-privacy")).toHaveAttribute("href", "/privacy");
  await expect(links.getByTestId("policy-link-terms")).toHaveAttribute("href", "/terms");
  await expect(links.getByTestId("policy-link-support")).toHaveAttribute("href", "/support");
  await links.getByTestId("policy-link-privacy").click();
  await expect(page.getByTestId("legal-privacy")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("سياسة الخصوصية");

  await page.goto("/en");
  await expect(page.getByTestId("coming-soon-policies").getByTestId("policy-link-support")).toHaveAttribute("href", "/en/support");
});

test("closed store: an account can still be deleted, signing in on the page itself", async ({ page }) => {
  // The build is mocked (playwright.prod.config.ts): "none" lets the deletion through.
  await page.addInitScript(() => window.sessionStorage.setItem("shubayr.mock.account-deletion", "none"));
  await page.goto("/account/delete");
  await expect(page.getByTestId("delete-signed-out")).toBeVisible();
  await page.getByTestId("auth-phone").fill("07701234567");
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill("123456");
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("delete-confirm")).toBeVisible();
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("delete-done")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("shubayr.session.v1"))).toBeNull();
});
