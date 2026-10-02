import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * Shared plumbing for the admin's live suite.
 *
 * The browser drives the admin; the API is called directly only to SET UP a
 * scenario (a throwaway staff account, a password already changed) or to
 * VERIFY an outcome the UI cannot show (a phone's OTP role). Every account a
 * test creates is unique to the run, so the suite can run repeatedly against
 * the same database.
 */

export const API = process.env.ADMIN_LIVE_API ?? "http://localhost:8000/api/v1";
export const DEV_OTP = process.env.DEV_OTP ?? "000000";

/** The seeded administrator (backend/prisma/seed.ts — development only). */
export const ADMIN_USERNAME = process.env.LIVE_ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD =
  process.env.LIVE_ADMIN_PASSWORD ?? "Shubayr-Dev-Admin!2026";

/** A password that satisfies the policy, for accounts the tests activate. */
export const KNOWN_PASSWORD = "Live-Test-Pass!2026";

export function unique(prefix: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}.${stamp}${random}`;
}

/** A random Iraqi mobile number that no seed or customer uses. */
export function randomWorkPhone(): string {
  const digits = Array.from({ length: 7 }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  return `+964789${digits}`;
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * The gate every live spec opens with: under playwright.live.config.ts an
 * unreachable API fails the run. Any HTTP status — a 429 included — means the
 * API is there.
 */
export async function requireLiveApi(
  request: APIRequestContext,
): Promise<void> {
  let up = true;
  try {
    await request.get(`${API}/settings`, { timeout: 5_000 });
  } catch {
    up = false;
  }
  if (!up && process.env.ADMIN_LIVE_REQUIRED === "1") {
    throw new Error(`No API at ${API}, but the admin live suite requires one.`);
  }
  test.skip(!up, `No API at ${API}.`);
  await awaitHeadroom(request);
}

/**
 * Start each test with room in the API's rate-limit window.
 *
 * The API limits 120 requests a minute per address, and the browser (through
 * the BFF) and this runner share one address, so a test that starts with a
 * nearly spent window fails halfway — as a 429 on GET /me, which the layout
 * shows as "server unreachable". Waiting only when the window is already
 * empty is not enough; this waits until `min` requests remain, and extends
 * the test's timeout by the time spent waiting.
 */
export async function awaitHeadroom(
  request: APIRequestContext,
  // A signed-in full page load costs ~6 API calls (layout and shell /me, the
  // bell's count, stream ticket and stream), and the later specs make many.
  min = 100,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await request.get(`${API}/settings`, { timeout: 5_000 });
    const headers = response.headers();
    const remaining = Number(headers["x-ratelimit-remaining"] ?? "999");
    if (response.status() !== 429 && remaining >= min) return;
    const reset = Number(
      headers["retry-after"] ?? headers["x-ratelimit-reset"] ?? "5",
    );
    const seconds = Number.isFinite(reset) ? Math.min(Math.max(reset, 1), 60) : 5;
    // Extend BEFORE waiting: the wait runs inside the test's own timeout.
    test.info().setTimeout(test.info().timeout + seconds * 1000 + 1000);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 500));
  }
}

/** Wait out the API's rate-limit window when a probe says it is exhausted. */
export async function awaitQuota(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.get(`${API}/settings`, { timeout: 5_000 });
    if (response.status() !== 429) return;
    const retryAfter = Number(response.headers()["retry-after"] ?? "5");
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        (Number.isFinite(retryAfter) ? Math.min(retryAfter, 60) : 5) * 1000 +
          500,
      ),
    );
  }
}

/**
 * POST /admin/auth/login, waiting out the rate limit.
 *
 * Sign-in has its own throttle (30 a minute per address) on top of the
 * global one, so a 429 here is waited out per ITS Retry-After — probing the
 * global quota would come back fine and retry straight into the same 429.
 * A lockout (ACCOUNT_LOCKED) is an outcome, never retried.
 */
export async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await request.post(`${API}/admin/auth/login`, {
      data: { username, password },
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (response.status() !== 429 || body.code === "ACCOUNT_LOCKED" || attempt === 3) {
      return { status: response.status(), body };
    }
    const retryAfter = Number(response.headers()["retry-after"] ?? "20");
    const seconds = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 60) : 20;
    // Extend BEFORE waiting: the wait runs inside the test's own timeout.
    test.info().setTimeout(test.info().timeout + seconds * 1000 + 1000);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 500));
  }
}

let adminToken: string | null = null;

export async function adminApiToken(
  request: APIRequestContext,
): Promise<string> {
  if (adminToken) return adminToken;
  const { status, body } = await apiLogin(
    request,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
  );
  expect(status, "seeded admin login").toBe(201);
  adminToken = body.access_token as string;
  return adminToken;
}

export interface Preset {
  id: string;
  name: string;
}

export async function presetByName(
  request: APIRequestContext,
  name: string,
): Promise<Preset> {
  const response = await request.get(`${API}/admin/presets`, {
    headers: bearer(await adminApiToken(request)),
  });
  expect(response.ok()).toBe(true);
  const preset = ((await response.json()) as Preset[]).find(
    (row) => row.name === name,
  );
  expect(preset, `seeded preset ${name}`).toBeTruthy();
  return preset!;
}

export interface CreatedStaff {
  id: string;
  username: string;
  password: string;
}

/** Create a staff account through the API, with a temporary password. */
export async function createStaff(
  request: APIRequestContext,
  options: {
    presets?: string[];
    permissionKeys?: string[];
    prefix?: string;
  } = {},
): Promise<CreatedStaff> {
  const presetIds = [];
  for (const name of options.presets ?? [])
    presetIds.push((await presetByName(request, name)).id);
  const username = unique(options.prefix ?? "live");
  const password = "Temp-Pass!" + Math.random().toString(36).slice(2, 8) + "A1";
  const response = await request.post(`${API}/admin/staff`, {
    headers: bearer(await adminApiToken(request)),
    data: {
      username,
      name: `Live ${username}`,
      password,
      preset_ids: presetIds,
      permission_keys: options.permissionKeys ?? [],
      reason: "Admin live test setup",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const created = (await response.json()) as { id: string };
  return { id: created.id, username, password };
}

/** Replace the temporary password through the API, so the UI can sign in directly. */
export async function activateStaff(
  request: APIRequestContext,
  staff: CreatedStaff,
): Promise<CreatedStaff> {
  const { status, body } = await apiLogin(
    request,
    staff.username,
    staff.password,
  );
  expect(status).toBe(201);
  const changed = await request.post(`${API}/admin/auth/change-password`, {
    headers: bearer(body.access_token as string),
    data: { current_password: staff.password, new_password: KNOWN_PASSWORD },
  });
  expect(changed.status(), await changed.text()).toBe(201);
  return { ...staff, password: KNOWN_PASSWORD };
}

export async function setAccess(
  request: APIRequestContext,
  staffId: string,
  presets: string[],
  permissionKeys: string[],
): Promise<void> {
  const presetIds = [];
  for (const name of presets)
    presetIds.push((await presetByName(request, name)).id);
  const response = await request.put(`${API}/admin/staff/${staffId}/access`, {
    headers: bearer(await adminApiToken(request)),
    data: {
      preset_ids: presetIds,
      permission_keys: permissionKeys,
      reason: "Admin live test access change",
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Sign in through the admin's own form.
 *
 * The API allows 30 sign-in attempts a minute from one address, and every
 * attempt in this suite comes from the same one, so a rate-limit answer is
 * waited out (per its Retry-After) and the attempt repeated. A lockout is NOT
 * retried — that is an outcome the tests assert.
 */
export async function uiLogin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto("/login");
    await page.getByTestId("login-username").fill(username);
    await page.getByTestId("login-password").fill(password);
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        candidate.url().endsWith("/api/auth/login"),
      ),
      page.getByTestId("login-submit").click(),
    ]);
    if (response.status() !== 429) return;
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    if (body.code === "ACCOUNT_LOCKED") return;
    const seconds = Number(response.headers()["retry-after"] ?? "20");
    await page.waitForTimeout(
      (Number.isFinite(seconds) ? Math.min(seconds, 60) : 20) * 1000 + 500,
    );
  }
}

export async function uiLoginAsAdmin(page: Page): Promise<void> {
  await uiLogin(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await expect(page.getByTestId("dashboard")).toBeVisible();
}

/* ------------------------------------------------------------ orders */

/** The seeded customer, and the admin's own phone (the same user as `admin`). */
export const CUSTOMER_PHONE = "+9647700000006";
export const ADMIN_PHONE = "+9647700000001";

const EARBUDS = "40000000-0000-4000-8000-000000000001";
const EARBUDS_VARIANT = "50000000-0000-4000-8000-000000000001";

const appTokens = new Map<string, string>();

/** An app-surface token for a phone, through the dev OTP. */
export async function phoneToken(
  request: APIRequestContext,
  phone: string,
): Promise<string> {
  const cached = appTokens.get(phone);
  if (cached) return cached;
  await awaitQuota(request);
  await request.post(`${API}/auth/request-otp`, { data: { phone } });
  const verified = await request.post(`${API}/auth/verify-otp`, {
    data: { phone, code: DEV_OTP, client: "web_store" },
  });
  expect(verified.ok(), await verified.text()).toBe(true);
  const token = (await verified.json()).access_token as string;
  appTokens.set(phone, token);
  return token;
}

export interface PlacedOrder {
  id: string;
  order_number: string;
  delivery_id: string;
}

/**
 * Place a fresh one-line COD order as `phone`. Placing it as ADMIN_PHONE puts
 * an `order_placed` notification in the admin's own inbox — the staff
 * account and that phone are one user, and the inbox is shared across
 * surfaces — which is how the inbox specs get live events (API 7.0 has no
 * staff-targeted events yet).
 */
export async function placeOrder(
  request: APIRequestContext,
  phone: string = CUSTOMER_PHONE,
): Promise<PlacedOrder> {
  const token = await phoneToken(request, phone);
  const headers = bearer(token);
  const addresses = await (
    await request.get(`${API}/addresses`, { headers })
  ).json();
  let addressId = (addresses.data ?? addresses)?.[0]?.id as string | undefined;
  if (!addressId) {
    const created = await request.post(`${API}/addresses`, {
      headers,
      data: { label: "Live", city: "واسط", area: "الكوت", contact_phone: phone },
    });
    expect(created.ok(), await created.text()).toBe(true);
    addressId = (await created.json()).id;
  }
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) {
    await request.delete(`${API}/cart/items/${item.id}`, { headers });
  }
  const added = await request.post(`${API}/cart/items`, {
    headers,
    data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 1 },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: {
      ...headers,
      "Idempotency-Key": `admin-live-${Date.now()}-${Math.random()}`,
    },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as PlacedOrder;
}

/** Move an order through staff transitions as the seeded admin. */
export async function advanceOrder(
  request: APIRequestContext,
  orderId: string,
  statuses: string[],
): Promise<void> {
  const token = await adminApiToken(request);
  const detail = await request.get(`${API}/admin/orders/${orderId}`, {
    headers: bearer(token),
  });
  expect(detail.ok(), await detail.text()).toBe(true);
  let version = ((await detail.json()) as { version: number }).version;
  for (const status of statuses) {
    const moved = await request.patch(`${API}/admin/orders/${orderId}/status`, {
      headers: bearer(token),
      data: { status, version },
    });
    expect(moved.ok(), `${status}: ${await moved.text()}`).toBe(true);
    version = ((await moved.json()) as { version: number }).version;
  }
}

export async function orderStatus(
  request: APIRequestContext,
  orderId: string,
): Promise<string> {
  const response = await request.get(`${API}/admin/orders/${orderId}`, {
    headers: bearer(await adminApiToken(request)),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).status as string;
}
