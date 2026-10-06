import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { requireLiveApi, uiLoginAsAdmin } from "./helpers";

/**
 * Production hardening of the Web Admin, as the browser receives it: the
 * security headers and the per-request CSP nonce, no CSP violation while
 * screens (and the inbox stream) work, noindex everywhere, no source maps,
 * the Arabic 404, and the BFF's CSRF refusals. CI serves the production
 * build (CI=1, `next start`); a local dev run checks what dev can.
 */

const PRODUCTION = Boolean(process.env.CI);
const ORIGIN = `http://localhost:${process.env.ADMIN_E2E_PORT ?? 3300}`;

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

function directive(csp: string, name: string): string {
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";
}

function expectHardened(headers: Record<string, string>, path: string) {
  const csp = headers["content-security-policy"];
  expect(csp, path).toBeTruthy();
  const scripts = directive(csp, "script-src");
  expect(scripts, path).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(scripts, path).toContain("'strict-dynamic'");
  expect(scripts, path).not.toContain("'unsafe-inline'");
  if (PRODUCTION) expect(scripts, path).not.toContain("'unsafe-eval'");
  expect(directive(csp, "frame-ancestors"), path).toBe("frame-ancestors 'none'");
  expect(directive(csp, "connect-src"), path).toMatch(/^connect-src 'self'/);
  expect(headers["x-frame-options"], path).toBe("DENY");
  expect(headers["x-robots-tag"], path).toBe("noindex, nofollow");
  expect(headers["strict-transport-security"], path).toMatch(/max-age=\d{7,}/);
  expect(headers["x-content-type-options"], path).toBe("nosniff");
  expect(headers["referrer-policy"], path).toBe("same-origin");
  expect(headers["permissions-policy"], path).toContain("camera=()");
  expect(headers["x-powered-by"], path).toBeUndefined();
}

function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test("the sign-in page and every signed-in page carry the hardened headers and a fresh nonce", async ({ page, request }) => {
  const login = await request.get("/login");
  expectHardened(login.headers(), "/login");

  await uiLoginAsAdmin(page);
  const nonces = new Set<string>();
  for (const path of ["/", "/orders", "/catalog/products", "/finance/ledger"]) {
    // A fresh request with the session cookies: the HTML exactly as served.
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expectHardened(headers, path);
    const nonce = /'nonce-([^']+)'/.exec(headers["content-security-policy"])![1]!;
    nonces.add(nonce);
    // Every script the server rendered is stamped with this response's nonce
    // (scripts those load later are trusted through 'strict-dynamic').
    const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`);
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", "noindex, nofollow");
  }
  expect(nonces.size).toBe(4);
});

test("screens and the live inbox work under the CSP with no violation", async ({ page }) => {
  const violations = watchViolations(page);
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await uiLoginAsAdmin(page);
  for (const path of ["/", "/orders", "/orders/board", "/catalog/products", "/inventory/stock", "/purchasing/invoices/new"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  // The inbox stream (SSE through the BFF) connects from a page.
  const stream = page.waitForResponse((response) => response.url().includes("/api/notifications/stream"), { timeout: 30_000 });
  await page.goto("/");
  expect((await stream).status()).toBe(200);
  // Client-side work still runs: the locale switch round-trips.
  await page.getByTestId("locale-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByTestId("locale-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  expect(violations).toEqual([]);
});

test("robots.txt disallows everything", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Disallow: /");
  expect(body).not.toContain("Allow: /\n");
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("no source maps are served in production", async ({ page, request }) => {
  test.skip(!PRODUCTION, "The dev server serves source maps by design.");
  await page.goto("/login");
  const chunk = await page.locator('script[src*="/_next/static/"]').first().getAttribute("src");
  expect(chunk).toBeTruthy();
  expect((await request.get(chunk!)).status()).toBe(200);
  expect((await request.get(`${chunk}.map`)).status()).toBe(404);
});

test("an unknown page is a 404 in Arabic", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const response = await page.goto("/no-such-screen");
  expect(response!.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByTestId("not-found")).toContainText("الصفحة غير موجودة");
  expectHardened(response!.headers(), "/no-such-screen");
});

test("the BFF refuses state changes without this admin's Origin, for every method", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const cases: Array<[string, Record<string, string>]> = [
    ["no Origin", {}],
    ["a foreign Origin", { Origin: "https://evil.example" }],
    ["a look-alike Origin", { Origin: `${ORIGIN}.evil.example` }],
  ];
  for (const [label, headers] of cases) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await page.request.fetch("/api/proxy/admin/presets", { method, headers, data: { name: "never" } });
      expect(response.status(), `${method} with ${label}`).toBe(403);
      expect((await response.json()).code, `${method} with ${label}`).toBe("CSRF_ORIGIN_MISMATCH");
    }
  }
  // Reads are not state changes and pass with the session cookies.
  expect((await page.request.get("/api/proxy/admin/presets")).status()).toBe(200);
  // The session cookies themselves: httpOnly, Secure, SameSite=Strict.
  const cookies = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("shubayr_admin_"));
  expect(cookies.length).toBe(2);
  for (const cookie of cookies) {
    expect(cookie.httpOnly, cookie.name).toBe(true);
    expect(cookie.secure, cookie.name).toBe(true);
    expect(cookie.sameSite, cookie.name).toBe("Strict");
  }
});
