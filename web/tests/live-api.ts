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
 * Each Playwright worker's own phone accounts, by app role, so parallel
 * workers never share a cart, orders, custody, or an inbox. Since API 6.0 a
 * phone only ever yields an `app` session — staff operations need
 * `staffToken` below.
 *
 * A number is +964 7{role}{slot}{stamp}: the role digit, the worker's slot
 * (TEST_PARALLEL_INDEX, unique among the workers running at once) and the
 * seconds since the epoch when the worker started, so every run — and every
 * worker a failure restarts — gets fresh accounts on a database that keeps
 * the earlier ones. The customer is created by its first OTP sign-in; the
 * agent and monitor are registered as work phones first (`ensureIdentity`).
 */
const SLOT = Number(process.env.TEST_PARALLEL_INDEX ?? "0") % 10;
const STAMP = String(Math.floor(Date.now() / 1000) % 10_000_000).padStart(7, "0");

function workerPhone(role: string): { e164: string; local: string } {
  const national = `7${role}${SLOT}${STAMP}`;
  return { e164: `+964${national}`, local: `0${national}` };
}

const CUSTOMER = workerPhone("5");
const AGENT = workerPhone("6");
const MONITOR = workerPhone("4");

export const CUSTOMER_E164 = CUSTOMER.e164;
export const CUSTOMER_LOCAL = CUSTOMER.local;
export const AGENT_E164 = AGENT.e164;
export const AGENT_LOCAL = AGENT.local;
export const MONITOR_E164 = MONITOR.e164;
export const MONITOR_LOCAL = MONITOR.local;

/** The seeded customer, for the few checks about the seed itself. */
export const SEEDED_CUSTOMER_E164 = "+9647700000006";

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

  await ensureIdentity(request, phone);
  await awaitQuota(request);
  await request.post(`${API}/auth/request-otp`, { data: { phone } });
  const verified = await request.post(`${API}/auth/verify-otp`, {
    data: { phone, code: OTP, client: "web_store" },
  });
  expect(verified.ok()).toBe(true);

  const token = (await verified.json()).access_token as string;
  tokens.set(phone, token);
  // A new customer has no address yet; checkout and orders need one.
  if (phone === CUSTOMER.e164) await customerAddress(request);
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

/** This worker's agent and monitor phones, by the role they must hold. */
const WORK_ROLES: Record<string, "delivery_agent" | "order_monitor"> = {
  [AGENT.e164]: "delivery_agent",
  [MONITOR.e164]: "order_monitor",
};
const provisioned = new Map<string, Promise<void>>();

/**
 * Make sure this worker's agent or monitor exists before its phone first
 * signs in: an unregistered number would sign in as a customer instead.
 * Registering a delivery agent also gives it its delivery party (API 11.2).
 * Once per phone per worker; customers need nothing — their first OTP
 * sign-in creates them.
 */
export async function ensureIdentity(
  request: APIRequestContext,
  phone: string,
): Promise<void> {
  const role = WORK_ROLES[phone];
  if (!role) return;
  let done = provisioned.get(phone);
  if (!done) {
    done = (async () => {
      const admin = await staffToken(request);
      const registered = await request.post(`${API}/admin/work-phones`, {
        headers: bearer(admin),
        data: {
          phone,
          name: `Live ${role} ${SLOT}-${STAMP}`,
          role,
          reason: "Web live suite: this worker's own account",
        },
      });
      expect(registered.ok(), await registered.text()).toBe(true);
    })();
    provisioned.set(phone, done);
    done.catch(() => provisioned.delete(phone));
  }
  await done;
}

let addressId: Promise<string> | null = null;

/** This worker's customer's delivery address, created on first use. */
export async function customerAddress(request: APIRequestContext): Promise<string> {
  if (!addressId) {
    addressId = (async () => {
      const headers = bearer(await customerToken(request));
      const list = await (await request.get(`${API}/addresses`, { headers })).json();
      const existing = (list.data ?? list)?.[0]?.id as string | undefined;
      if (existing) return existing;
      const created = await request.post(`${API}/addresses`, {
        headers,
        data: {
          label: "المنزل",
          city: "واسط",
          area: "الكوت",
          street: "شارع الجمهورية",
          contact_phone: CUSTOMER.e164,
          is_default: true,
        },
      });
      expect(created.ok(), await created.text()).toBe(true);
      return (await created.json()).id as string;
    })();
    addressId.catch(() => {
      addressId = null;
    });
  }
  return addressId;
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
  const e164 = `+964${phoneLocal.slice(1)}`;
  await ensureIdentity(page.request, e164);
  // Checkout and orders need the customer's saved address.
  if (e164 === CUSTOMER.e164) await customerAddress(page.request);
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

export interface PlacedOrder {
  id: string;
  order_number: string;
  delivery_id: string;
  total: number;
}

/**
 * Place a fresh COD order as this worker's customer. A new order notifies
 * every active order monitor (`new_order`), which is what the inbox specs
 * lean on.
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
    data: { address_id: await customerAddress(request), payment_method: "cod" },
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
  const detail = await request.get(`${API}/admin/orders/${orderId}`, {
    headers: bearer(admin),
  });
  expect(detail.ok(), await detail.text()).toBe(true);
  let version = ((await detail.json()) as { version: number }).version;
  for (const status of statuses) {
    const moved = await request.patch(`${API}/admin/orders/${orderId}/status`, {
      headers: bearer(admin),
      data: { status, version },
    });
    expect(moved.ok(), `${status}: ${await moved.text()}`).toBe(true);
    version = ((await moved.json()) as { version: number }).version;
  }
}

/** The seeded shelf and sellable location (backend/prisma/seed.ts). */
const SEEDED_CATEGORY = "30000000-0000-4000-8000-000000000023";
const SEEDED_LOCATION = "90000000-0000-4000-8000-000000000002";

/**
 * A published one-SKU product with its own opening stock, for a test that
 * changes a product (hides it, sells it out) without touching the seeded
 * catalogue the other workers are ordering from at the same time.
 */
export async function stockedProduct(
  request: APIRequestContext,
  key: string,
  quantity = 5,
): Promise<{ id: string; variant: string }> {
  const admin = bearer(await staffToken(request));
  const tag = `${key}-${SLOT}${STAMP}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const created = await request.post(`${API}/admin/products`, {
    headers: admin,
    data: {
      category_id: SEEDED_CATEGORY,
      name_en: `Live ${tag}`,
      name_ar: `منتج حي ${tag}`,
      price: 15000,
      discount_type: null,
      tracks_expiry: false,
      status: "active",
      published: true,
      variants: [{ sku: `WEB-LIVE-${tag}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const product = await created.json();
  const variant = product.variants[0].id as string;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
  const opening = await request.post(`${API}/admin/inventory/openings`, {
    headers: admin,
    data: {
      operation_id: `web-live-open-${tag}`,
      document_date: today,
      lines: [{ variant_id: variant, location_id: SEEDED_LOCATION, quantity: String(quantity), unit_cost_iqd: "5000" }],
    },
  });
  expect(opening.status(), await opening.text()).toBe(201);
  return { id: product.id as string, variant };
}

/** Assign a delivery to this worker's delivery agent. */
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
