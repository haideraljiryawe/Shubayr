import { deflateSync } from "node:zlib";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import ar from "../src/messages/ar.json";
import en from "../src/messages/en.json";
import { API, bearer, customerToken, requireLiveApi, signIn, staffToken, stockedProduct } from "./live-api";

/**
 * PR W1 against the real API (DEV_OTP): a banner made in the admin with a
 * structured product action and no text reaches the store; Recently Added
 * follows the owner's switch; the per-order maximum is shown, caps the
 * stepper, and the server's refusals at add-to-cart and at checkout are
 * worded; the sign-in countdown and attempts follow the server.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live W1 tests");
});

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

function crc(buffer: Buffer): number {
  let value = ~0;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return ~value >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body), 0);
  return Buffer.concat([length, body, sum]);
}
/** A 2:1 picture, generated here so nothing is downloaded. */
function png(width = 800, height = 400): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([47, 107, 63], 1 + x * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function emptyCart(request: APIRequestContext) {
  const headers = bearer(await customerToken(request));
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) await request.delete(`${API}/cart/items/${item.id}`, { headers });
}

async function setLimit(request: APIRequestContext, productId: string, max: number) {
  const response = await request.patch(`${API}/admin/products/${productId}`, {
    headers: bearer(await staffToken(request)),
    data: { purchase_limit_enabled: true, purchase_limit_max_quantity: max },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Reload until the (cached) home page shows what the API now serves. */
async function homeUntil(page: Page, path: string, ready: () => Promise<boolean>, seconds = 90) {
  await expect
    .poll(
      async () => {
        await page.goto(path);
        return ready();
      },
      { timeout: seconds * 1000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
}

test("a banner made in the admin — image only, opening a product — reaches the store in both languages", async ({ page, request }) => {
  const admin = bearer(await staffToken(request));
  const product = await stockedProduct(request, "BANNER");
  const upload = await request.post(`${API}/media/images`, {
    headers: admin,
    multipart: { file: { name: "w1-banner.png", mimeType: "image/png", buffer: png() } },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const media = await upload.json();
  const created = await request.post(`${API}/admin/banners`, {
    headers: admin,
    data: {
      title: "W1 live banner",
      internal_name: "W1 live banner",
      title_ar: "لافتة حية",
      title_en: "Live banner",
      image_url: media.public_url ?? media.url,
      show_text: false,
      action_type: "product",
      action_target_id: product.id,
      sort_order: 0,
      is_active: true,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const banner = await created.json();
  try {
    expect(banner.action).toMatchObject({ type: "product", target: { id: product.id, available: true } });
    const slide = page.locator(`[data-testid="hero-banner"][data-target="internal:/product/${product.id}"]`);
    await homeUntil(page, "/", async () => (await slide.count()) > 0);
    await expect(slide).toHaveAttribute("data-show-text", "false");
    await expect(slide.getByTestId("hero-title")).toHaveCount(0);
    await expect(slide.getByTestId("hero-card-link")).toHaveAttribute("href", `/product/${product.id}`);
    await expect(slide.getByTestId("hero-card-link")).toHaveAttribute("aria-label", "لافتة حية");
    await page.goto("/en");
    await expect(slide.getByTestId("hero-card-link")).toHaveAttribute("href", `/en/product/${product.id}`);
    await expect(slide.getByTestId("hero-card-link")).toHaveAttribute("aria-label", "Live banner");
  } finally {
    await request.delete(`${API}/admin/banners/${banner.id}`, { headers: admin });
  }
});

test("Recently Added follows the owner's switch: on shows the newest product first", { tag: "@global" }, async ({ page, request }) => {
  const admin = bearer(await staffToken(request));
  const before = (await (await request.get(`${API}/admin/settings`, { headers: admin })).json()).settings as Record<string, unknown>;
  const put = (settings: Record<string, string>) => request.put(`${API}/admin/settings`, { headers: admin, data: { settings } });
  try {
    expect((await put({ recently_added_enabled: "true", recently_added_max_count: "4", recently_added_window_days: "30" })).ok()).toBe(true);
    const product = await stockedProduct(request, "RECENT");
    const recent = page.getByTestId("recently-added");
    await homeUntil(page, "/en", async () =>
      (await recent.count()) > 0 && (await recent.locator('a[href*="/product/"]').first().getAttribute("href")) === `/en/product/${product.id}`,
    );
    await expect(recent).toContainText(en.home.recentlyAddedTitle);
    expect(Number(await recent.getAttribute("data-count"))).toBeLessThanOrEqual(4);
    await expect(page.getByTestId("new-arrivals")).toHaveCount(0);

    expect((await put({ recently_added_enabled: "false" })).ok()).toBe(true);
    await homeUntil(page, "/", async () => (await recent.count()) === 0 && (await page.getByTestId("new-arrivals").count()) > 0);
  } finally {
    await put({
      recently_added_enabled: String(before.recently_added_enabled ?? false),
      recently_added_max_count: String(before.recently_added_max_count ?? 10),
      recently_added_window_days: String(before.recently_added_window_days ?? 30),
    });
  }
});

test("per-order maximum: shown, the stepper capped, and the server's refusals worded at add-to-cart and at checkout", async ({ page, request }) => {
  await emptyCart(request);
  const product = await stockedProduct(request, "LIMIT", 10);
  await setLimit(request, product.id, 3);
  try {
    await signIn(page, `/product/${product.id}`);
    await expect(page.getByTestId("purchase-limit")).toContainText(fill(ar.purchaseLimit.max, { max: 3 }));
    const increase = page.locator(`button[aria-label="${ar.common.increase}"]:visible`).first();
    await increase.click();
    await increase.click();
    await expect(increase).toBeDisabled();
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await expect(page.getByTestId("purchase-limit-reached")).toBeVisible();

    // The owner lowers the maximum while 3 are in the cart: checkout refuses, by name.
    await setLimit(request, product.id, 2);
    await page.goto("/checkout");
    await page.getByTestId("address-submit").click();
    await page.getByTestId("place-order").click();
    await expect(page.getByText(/يمكنك طلب 2 قطعة كحد أقصى من «.+» في الطلب الواحد \(طلبت 3\)\./)).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText("PRODUCT_ORDER_LIMIT_EXCEEDED")).toHaveCount(0);

    // A page opened before the maximum fell: the server refuses the add, in words.
    await emptyCart(request);
    const other = await stockedProduct(request, "LIMIT2", 10);
    await setLimit(request, other.id, 3);
    await page.goto(`/product/${other.id}`);
    await expect(page.getByTestId("purchase-limit")).toContainText(fill(ar.purchaseLimit.max, { max: 3 }));
    await setLimit(request, other.id, 1);
    await page.locator(`button[aria-label="${ar.common.increase}"]:visible`).first().click();
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await expect(page.getByText(fill(ar.purchaseLimit.refused, { allowed: 1, requested: 2, unit: ar.purchaseLimit.pieces }))).toBeVisible();
  } finally {
    await emptyCart(request);
  }
});

test.describe("sign-in follows the server (contract 17.13.0)", () => {
  // A number of its own, never signed in, so no account is created.
  const phone = () => `077${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  test("the resend countdown is the server's, and wrong codes count down to a locked code", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByTestId("auth-phone").fill(phone());
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.request().method() === "POST" && candidate.url().endsWith("/auth/request-otp")),
      page.getByTestId("auth-send-otp").click(),
    ]);
    expect(response.status()).toBe(200);
    const wait = (await response.json()).resend_after_seconds as number;
    expect(wait).toBeGreaterThan(0);
    // The button unlocks when the server says, not after a fixed guess.
    await expect(page.getByTestId("auth-resend")).toBeEnabled({ timeout: (wait + 5) * 1000 });

    const code = page.getByTestId("auth-code");
    for (const left of [4, 3, 2, 1]) {
      await code.fill("999999");
      await page.getByTestId("auth-verify").click();
      await expect(page.getByText(left === 1 ? "That code is wrong. 1 attempt left." : `That code is wrong. ${left} attempts left.`)).toBeVisible();
    }
    await code.fill("999999");
    await page.getByTestId("auth-verify").click();
    await expect(page.getByText(en.auth.errAttemptsExceeded)).toBeVisible();
    await expect(code).toBeDisabled();
    await expect(page.getByTestId("auth-resend")).toHaveText(en.auth.requestNewCode);
  });
});
