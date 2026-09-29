import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * Shared plumbing for the live suites.
 *
 * Two things here earn their own module rather than being copied per spec.
 *
 * The first is telling "no backend" apart from "the backend said no". The
 * earlier helper called `response.ok()` and skipped the suite on anything
 * else, so a 429 from the rate limiter read as "nothing is running" and every
 * test skipped — a green run that had verified nothing. Only a transport
 * failure means absent now; a status, any status, means the API is there.
 *
 * The second is the rate limit itself. The API allows 120 requests per window
 * and a full live run brushes against that, so tokens are cached per phone and
 * `awaitQuota` waits the window out rather than letting the suite skip.
 */

export const API =
  process.env.PLAYWRIGHT_LIVE_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api/v1";

export const OTP = process.env.DEV_OTP ?? "000000";

/**
 * Seeded phone accounts, by app role. Since API 6.0 a phone only ever yields
 * an `app` session — staff operations need `staffToken` below.
 */
export const CUSTOMER_E164 = "+9647700000006";
export const CUSTOMER_LOCAL = "07700000006";
export const AGENT_E164 = "+9647700000005";
export const AGENT_LOCAL = "07700000005";
export const MONITOR_E164 = "+9647700000008";
export const MONITOR_LOCAL = "07700000008";

/** The seeded staff administrator (backend/prisma/seed.ts, dev only). */
export const STAFF_USERNAME = process.env.LIVE_ADMIN_USERNAME ?? "admin";
export const STAFF_PASSWORD =
  process.env.LIVE_ADMIN_PASSWORD ?? "Shubayr-Dev-Admin!2026";

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Is there an API at all?
 *
 * A 429 or a 500 still means yes — the suite should run and fail honestly
 * rather than skip and look green.
 */
export async function reachable(request: APIRequestContext): Promise<boolean> {
  try {
    await request.get(`${API}/settings`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The one gate every live spec opens with.
 *
 * Under `npm run test:live` (playwright.live.config.ts sets
 * PLAYWRIGHT_LIVE_REQUIRED=1) a missing backend FAILS the test: that config
 * exists to exercise a real API, so a run that reached none has verified
 * nothing and must not report green. Anywhere else — the hermetic suite runs
 * live-catalog and live-checkout opportunistically — it skips as before.
 */
export async function requireLiveApi(
  request: APIRequestContext,
  what: string,
): Promise<void> {
  const up = await reachable(request);
  if (!up && process.env.PLAYWRIGHT_LIVE_REQUIRED === "1") {
    throw new Error(
      `No API at ${API}, but the live suite requires one to run ${what}.`,
    );
  }
  test.skip(!up, `No API at ${API} — start the backend to run ${what}.`);
}

/**
 * Wait until the rate-limit window has room again.
 *
 * `Retry-After` is in seconds and the window is short, so a handful of
 * attempts is plenty; if it never clears, the tests fail on their own
 * assertions instead of being quietly skipped.
 */
export async function awaitQuota(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.get(`${API}/settings`, { timeout: 5000 });
    if (response.status() !== 429) return;

    const retryAfter = Number(response.headers()["retry-after"] ?? "5");
    const seconds = Number.isFinite(retryAfter) ? retryAfter : 5;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(seconds, 60) * 1000 + 500),
    );
  }
}

/**
 * Access tokens, cached per phone for the life of the worker.
 *
 * Signing in costs two requests, and a spec that mints several orders would
 * otherwise spend a quarter of the rate-limit window just proving who it is.
 */
const tokens = new Map<string, string>();

export async function tokenFor(
  request: APIRequestContext,
  phone: string,
): Promise<string> {
  const cached = tokens.get(phone);
  if (cached) return cached;

  await awaitQuota(request);
  await request.post(`${API}/auth/request-otp`, { data: { phone } });
  const verified = await request.post(`${API}/auth/verify-otp`, {
    data: { phone, code: OTP, client: "web_store" },
  });
  expect(verified.ok()).toBe(true);

  const token = (await verified.json()).access_token as string;
  tokens.set(phone, token);
  return token;
}

export function customerToken(request: APIRequestContext): Promise<string> {
  return tokenFor(request, CUSTOMER_E164);
}

/**
 * An `admin`-surface token for the seeded administrator.
 *
 * API 6.0 splits the surfaces: the admin's phone now signs in as a plain
 * customer, and staff routes answer AUTH_SURFACE_FORBIDDEN to any app token.
 * Staff steps in the live suites (moving orders along, moderating reviews)
 * therefore sign in with username and password.
 */
let staff: string | null = null;

export async function staffToken(request: APIRequestContext): Promise<string> {
  if (staff) return staff;
  await awaitQuota(request);
  const response = await request.post(`${API}/admin/auth/login`, {
    data: { username: STAFF_USERNAME, password: STAFF_PASSWORD },
  });
  expect(response.ok()).toBe(true);
  staff = (await response.json()).access_token as string;
  return staff;
}

/**
 * Sign in through the real phone-OTP form and land on `next`.
 *
 * /login is the storefront's own entry point and honours ?next=, so this is
 * the returning customer's path rather than a test-only shortcut — no token is
 * injected, the OTP round trip really happens.
 */
export async function signIn(
  page: Page,
  next: string,
  phoneLocal: string = CUSTOMER_LOCAL,
): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // The form is rendered twice (narrow and wide); only one is ever visible.
  const phone = page.locator('[data-testid="auth-phone"]:visible');
  await expect(phone).toBeVisible();
  await phone.fill(phoneLocal);
  await page.locator('[data-testid="auth-send-otp"]:visible').click();
  await page.locator('[data-testid="auth-code"]:visible').fill(OTP);
  await page.locator('[data-testid="auth-verify"]:visible').click();
  // The redirect is what tells us the session is actually established.
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

/* ------------------------------------------------------ minting orders */

/** Stock sits on the variant; the variantless SKU is seeded at zero. */
const EARBUDS = "40000000-0000-4000-8000-000000000001";
const EARBUDS_VARIANT = "50000000-0000-4000-8000-000000000001";
const SEEDED_ADDRESS = "10000000-0000-4000-8000-000000000001";

export interface PlacedOrder {
  id: string;
  order_number: string;
  delivery_id: string;
}

/**
 * Place a fresh COD order as the seeded customer. A new order notifies every
 * active order monitor (`new_order`), which is what the inbox specs lean on.
 */
export async function placeOrder(request: APIRequestContext): Promise<PlacedOrder> {
  const customer = await customerToken(request);
  const cart = await (
    await request.get(`${API}/cart`, { headers: bearer(customer) })
  ).json();
  for (const item of cart.items ?? []) {
    await request.delete(`${API}/cart/items/${item.id}`, {
      headers: bearer(customer),
    });
  }
  await request.post(`${API}/cart/items`, {
    headers: bearer(customer),
    data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 1 },
  });
  const placed = await request.post(`${API}/orders`, {
    headers: {
      ...bearer(customer),
      "Idempotency-Key": `live-work-${Date.now()}-${Math.random()}`,
    },
    data: { address_id: SEEDED_ADDRESS, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as PlacedOrder;
}

/** Walk an order through staff transitions, in order. */
export async function advanceOrder(
  request: APIRequestContext,
  orderId: string,
  statuses: string[],
): Promise<void> {
  const admin = await staffToken(request);
  for (const status of statuses) {
    const moved = await request.patch(`${API}/admin/orders/${orderId}/status`, {
      headers: bearer(admin),
      data: { status },
    });
    expect(moved.ok(), `${status}: ${await moved.text()}`).toBe(true);
  }
}

/** Assign a delivery to the seeded delivery agent. */
export async function assignToAgent(
  request: APIRequestContext,
  deliveryId: string,
): Promise<void> {
  const admin = await staffToken(request);
  const agent = await tokenFor(request, AGENT_E164);
  const me = await (
    await request.get(`${API}/me`, { headers: bearer(agent) })
  ).json();
  const assigned = await request.patch(`${API}/deliveries/${deliveryId}/assign`, {
    headers: bearer(admin),
    data: { agent_id: me.id },
  });
  expect(assigned.ok(), await assigned.text()).toBe(true);
}
