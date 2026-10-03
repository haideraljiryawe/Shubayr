import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  ADMIN_PHONE,
  activateStaff,
  API,
  apiLogin,
  adminApiToken,
  bearer,
  createStaff,
  CUSTOMER_PHONE,
  phoneToken,
  requireLiveApi,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Order lifecycle v2 (API 10.0) in the Web Admin, in a real browser, through
 * the BFF, against a real API. Each scenario stocks a product of its own
 * (opening stock), places real customer orders, and drives the admin UI;
 * the API is used to set a scenario up (a stock count, a customer's
 * cancellation request or acceptance) or to check what the UI can't show.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const state: { agentId?: string; approver?: { username: string; password: string; token: string } } = {};

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH", path: string, data?: unknown, token?: string) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(token ?? (await adminApiToken(request))), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

interface Stocked {
  id: string;
  variant: string;
  sku: string;
}

/** A published product with one piece SKU and opening stock on the seeded shelf. */
async function stocked(request: APIRequestContext, key: string, quantity: number, { price = 9000, cost = 1000 } = {}): Promise<Stocked> {
  const sku = `LC-${run}-${key}`;
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Lifecycle ${key} ${run}`,
    name_ar: `دورة ${key} ${run}`,
    price,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variant = created.body.variants[0].id as string;
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `lc-open-${run}-${key}`,
    document_date: today(),
    lines: [{ variant_id: variant, location_id: LOCATION, quantity: String(quantity), unit_cost_iqd: String(cost) }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  return { id: created.body.id, variant, sku };
}

/** A COD order for `quantity` of `item`, placed as `phone`. */
async function order(request: APIRequestContext, item: Stocked, quantity: number, phone = CUSTOMER_PHONE) {
  const headers = bearer(await phoneToken(request, phone));
  const addresses = await (await request.get(`${API}/addresses`, { headers })).json();
  let addressId = (addresses.data ?? addresses)?.[0]?.id as string | undefined;
  if (!addressId) {
    const created = await request.post(`${API}/addresses`, { headers, data: { label: "Live", city: "واسط", area: "الكوت", contact_phone: phone } });
    addressId = (await created.json()).id;
  }
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: item.id, variant_id: item.variant, quantity } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `lc-${run}-${Math.random()}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as { id: string; order_number: string; delivery_id: string };
}

async function adminOrder(request: APIRequestContext, id: string) {
  const { body } = await api(request, "GET", `/admin/orders/${id}`);
  return body as { status: string; version: number; delivery_id: string; delivery: { id: string } | null; late_for_acceptance?: boolean };
}

async function move(request: APIRequestContext, id: string, statuses: string[]) {
  for (const status of statuses) {
    const { version } = await adminOrder(request, id);
    const moved = await api(request, "PATCH", `/admin/orders/${id}/status`, { status, version });
    expect(moved.status, `${status}: ${JSON.stringify(moved.body)}`).toBe(200);
  }
}

type Queue = "late" | "attention" | "cancellation";
const QUEUE_QUERY: Record<Queue, string> = { late: "late=true", attention: "needs_attention=true", cancellation: "cancellation_request=pending" };

/** The queue's tab shows the API's own count (re-read until both agree). */
async function expectQueueCount(page: Page, request: APIRequestContext, queue: Queue) {
  await expect
    .poll(async () => {
      await page.goto(`/orders?queue=${queue}`);
      const shown = Number(await page.getByTestId(`orders-queue-count-${queue}`).innerText());
      const { body } = await api(request, "GET", `/admin/orders?${QUEUE_QUERY[queue]}&per_page=1`);
      return shown === body.total && shown > 0;
    }, { timeout: 30_000 })
    .toBe(true);
}

/** The order is (or isn't) in a server-filtered queue view. */
async function expectInQueue(page: Page, queue: Queue, orderNumber: string, present: boolean) {
  await page.goto(`/orders?queue=${queue}&q=${orderNumber}`);
  await expect(page.getByTestId(`orders-tab-${queue}`)).toHaveAttribute("aria-current", "page");
  await expect(page.locator(`[data-order-number="${orderNumber}"]`)).toHaveCount(present ? 1 : 0);
}

/** A delivery status change by the seeded agent (API 10.0: with the order's version). */
async function agentMove(request: APIRequestContext, deliveryId: string, status: string, reason?: string) {
  const token = await phoneToken(request, "+9647700000005");
  const assigned = await (await request.get(`${API}/deliveries/assigned?per_page=100`, { headers: bearer(token) })).json();
  const delivery = (assigned.data as Array<{ id: string; order_version: number }>).find((row) => row.id === deliveryId)!;
  const moved = await request.patch(`${API}/deliveries/${deliveryId}`, {
    headers: bearer(token),
    data: { status, order_version: delivery.order_version, ...(reason ? { reason } : {}) },
  });
  expect(moved.ok(), await moved.text()).toBe(true);
}

async function dispatchOrder(request: APIRequestContext, placed: { id: string; delivery_id: string }) {
  await move(request, placed.id, ["confirmed", "preparing", "ready_for_dispatch"]);
  const assigned = await api(request, "PATCH", `/deliveries/${placed.delivery_id}/assign`, { agent_id: state.agentId });
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  await move(request, placed.id, ["dispatched"]);
}

/** Lower a SKU's stock with an approved count, behind the order's back. */
async function countDown(request: APIRequestContext, item: Stocked, counted: string) {
  const count = (await api(request, "POST", "/admin/inventory/counts", { variant_id: item.variant, reason: "Live lifecycle shortage" })).body;
  const approved = await api(request, "POST", `/admin/inventory/counts/${count.id}/approve`, {
    operation_id: `lc-count-${run}-${item.sku}`,
    document_date: today(),
    lines: count.lines.map((line: { batch_id: string; location_id: string }) => ({ batch_id: line.batch_id, location_id: line.location_id, counted_quantity: counted })),
  }, state.approver!.token);
  expect(approved.status, JSON.stringify(approved.body)).toBe(201);
}

async function act(page: Page, action: string, reason?: string) {
  await page.getByTestId(`order-action-${action}`).click();
  if (reason) await page.locator("dialog[open]").getByTestId("confirm-reason").fill(reason);
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
}

async function expectStatus(page: Page, status: string) {
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", status);
}

test.beforeAll(async ({ request }) => {
  await requireLiveApi(request);
  const agent = await (await request.get(`${API}/me`, { headers: bearer(await phoneToken(request, "+9647700000005")) })).json();
  state.agentId = agent.id;
  const approver = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "approver" }));
  const login = await apiLogin(request, approver.username, approver.password);
  expect(login.status, JSON.stringify(login.body)).toBe(201);
  state.approver = { ...approver, token: login.body.access_token as string };
});

/* ---------------------------------------------------------- happy path */

test("happy path through the admin UI: accept → prepare → ready → assign → dispatch → deliver, with the timeline", async ({ page, request }) => {
  const item = await stocked(request, "HAPPY", 5);
  const placed = await order(request, item, 2);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  await act(page, "accept");
  await expectStatus(page, "confirmed");
  await act(page, "prepare");
  await expectStatus(page, "preparing");
  await expect(page.getByTestId("order-pick-list")).toBeVisible();
  await act(page, "markReady");
  await expectStatus(page, "ready_for_dispatch");
  await page.getByTestId("agent-option").first().click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("order-action-dispatch")).toBeEnabled();
  await act(page, "dispatch");
  await expectStatus(page, "dispatched");
  await act(page, "deliver");
  await expectStatus(page, "delivered");
  for (const step of ["pending", "confirmed", "preparing", "ready_for_dispatch", "dispatched", "delivered"]) {
    await expect(page.locator(`[data-testid="timeline-event"][data-status="${step}"]`).first(), step).toBeVisible();
  }
});

test("a concurrent confirm answers 409: the page shows the current state and offers what is possible now", async ({ page, request }) => {
  const item = await stocked(request, "RACE", 3);
  const placed = await order(request, item, 1);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  await expect(page.getByTestId("order-action-accept")).toBeVisible();
  // Someone else confirms first, with the version this page also holds.
  await move(request, placed.id, ["confirmed"]);
  await act(page, "accept");
  await expect(page.getByTestId("order-conflict")).toBeVisible();
  await expectStatus(page, "confirmed");
  await expect(page.getByTestId("order-action-prepare")).toBeVisible();
  await expect(page.getByTestId("order-action-accept")).toHaveCount(0);
});

/* ---------------------------------------------------------------- late */

test("an order not accepted in time gets the late badge (list and detail)", async ({ page, request }) => {
  test.setTimeout(300_000);
  const original = (await api(request, "GET", "/admin/settings")).body;
  const open = {
    settings: { acceptance_alert_timeout_minutes: "1" },
    business_hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens_at: "00:00", closes_at: "23:59", is_closed: false })),
  };
  expect((await api(request, "PUT", "/admin/settings", open)).status).toBe(200);
  try {
    const item = await stocked(request, "LATE", 2);
    const placed = await order(request, item, 1);
    // The worker checks deadlines every 30 seconds.
    await expect.poll(async () => (await adminOrder(request, placed.id)).late_for_acceptance, { timeout: 180_000, intervals: [10_000] }).toBe(true);
    await uiLoginAsAdmin(page);
    await page.goto(`/orders?q=${placed.order_number}`);
    const row = page.locator('[data-testid="table-row"]', { has: page.locator(`[data-order-number="${placed.order_number}"]`) });
    await expect(row.getByTestId("flag-late")).toBeVisible();
    await page.goto(`/orders/${placed.id}`);
    await expect(page.getByTestId("order-late")).toBeVisible();
    await expect(page.getByTestId("order-late-alert")).toBeVisible();
    // The server-filtered Late queue holds it, with the API's count.
    await expectInQueue(page, "late", placed.order_number, true);
    await expectQueueCount(page, request, "late");
  } finally {
    const restore = {
      settings: { acceptance_alert_timeout_minutes: original.settings.acceptance_alert_timeout_minutes },
      business_hours: (original.business_hours as Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>).map(
        ({ weekday, opens_at, closes_at, is_closed }) => ({ weekday, opens_at, closes_at, is_closed }),
      ),
    };
    expect((await api(request, "PUT", "/admin/settings", restore)).status).toBe(200);
  }
});

/* ----------------------------------------------------------- pick lists */

test("a batch pick list for selected orders, in walking order", async ({ page, request }) => {
  const item = await stocked(request, "PICK", 6);
  const first = await order(request, item, 2);
  const second = await order(request, item, 3);
  await move(request, first.id, ["confirmed", "preparing"]);
  await move(request, second.id, ["confirmed", "preparing"]);
  await uiLoginAsAdmin(page);
  // Both are the newest orders in preparation, so they share the first page.
  await page.goto(`/orders?status=preparing`);
  for (const placed of [first, second]) {
    await page.locator('[data-testid="table-row"]', { has: page.locator(`[data-order-number="${placed.order_number}"]`) }).getByTestId("order-select").check();
  }
  await page.getByTestId("pick-batch").click();
  await expect(page.getByTestId("pick-list-sheet")).toBeVisible();
  await expect(page.locator(`[data-testid="pick-row"][data-order="${first.order_number}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-testid="pick-row"][data-order="${second.order_number}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-testid="pick-row"][data-order="${second.order_number}"]`).getByTestId("pick-quantity")).toHaveText("3");
  await expect(page.getByTestId("pick-list-print")).toBeVisible();
});

/* --------------------------------------------------------- needs attention */

test("a shortage: propose a smaller quantity the customer accepts; another order is cancelled", async ({ page, request }) => {
  const item = await stocked(request, "SHORT", 3);
  const placed = await order(request, item, 3);
  await countDown(request, item, "1");
  await move(request, placed.id, ["confirmed", "preparing"]);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  await expect(page.getByTestId("order-needs-attention")).toBeVisible();
  const line = page.getByTestId("short-line");
  await expect(line.getByTestId("short-quantity")).toHaveText("2");
  await expect(line.getByTestId("short-allocated")).toHaveText("1");
  // Ready is refused until the shortage is resolved.
  await act(page, "markReady");
  await expect(page.getByTestId("order-attention-refused")).toBeVisible();
  await line.getByTestId("short-reduce").click();
  await expect(page.locator("dialog[open]").getByTestId("reduce-quantity")).toHaveValue("1");
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Only one left after the count");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expect(page.getByTestId("reduction-proposal")).toHaveAttribute("data-status", "pending");

  // The customer accepts the smaller quantity.
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const mine = await (await request.get(`${API}/orders/${placed.id}`, { headers })).json();
  const accepted = await request.post(`${API}/orders/${placed.id}/shortage-response`, { headers, data: { decision: "accepted", version: mine.version } });
  expect(accepted.ok(), await accepted.text()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("reduction-proposal")).toHaveAttribute("data-status", "accepted");
  await expect(page.getByTestId("order-needs-attention")).toHaveCount(0);
  await expect(page.getByTestId("order-item")).toContainText("1");
  await act(page, "markReady");
  await expectStatus(page, "ready_for_dispatch");

  // A second short order is cancelled instead.
  const other = await stocked(request, "SHORT2", 2);
  const second = await order(request, other, 2);
  await countDown(request, other, "0");
  await move(request, second.id, ["confirmed", "preparing"]);
  await page.goto(`/orders/${second.id}`);
  await page.getByTestId("short-cancel-order").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Out of stock");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expectStatus(page, "cancelled");
});

/* ------------------------------------------------- cancellation requests */

test("cancellation requests: one approved, one denied, each with a reason", async ({ page, request }) => {
  const item = await stocked(request, "CXL", 4);
  const approved = await order(request, item, 1);
  const denied = await order(request, item, 1);
  await move(request, approved.id, ["confirmed"]);
  await move(request, denied.id, ["confirmed"]);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  for (const placed of [approved, denied]) {
    const mine = await (await request.get(`${API}/orders/${placed.id}`, { headers })).json();
    const asked = await request.post(`${API}/orders/${placed.id}/cancellation-request`, { headers, data: { version: mine.version, reason: "Ordered by mistake" } });
    expect(asked.ok(), await asked.text()).toBe(true);
  }
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${approved.id}`);
  await expect(page.getByTestId("order-cancel-requested")).toBeVisible();
  await expect(page.getByTestId("cancellation-reason")).toHaveText("Ordered by mistake");
  await page.getByTestId("cancellation-approve").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Customer asked before preparation");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expectStatus(page, "cancelled");
  await expect(page.getByTestId("cancellation-request")).toHaveAttribute("data-status", "approved");

  await page.goto(`/orders/${denied.id}`);
  await page.getByTestId("cancellation-deny").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Already packed for today's route");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expect(page.getByTestId("cancellation-request")).toHaveAttribute("data-status", "denied");
  await expectStatus(page, "confirmed");
  await expect(page.getByTestId("cancellation-resolution")).toHaveText("Already packed for today's route");
});

/* ------------------------------------------------- server-filtered queues */

test("work queues are filtered by the server: needs attention and cancellation requests, with the API's counts", async ({ page, request }) => {
  // Short: counted below what the order needs, while it is being prepared.
  const shortItem = await stocked(request, "QATT", 3);
  const short = await order(request, shortItem, 3);
  await countDown(request, shortItem, "1");
  await move(request, short.id, ["confirmed", "preparing"]);
  // Cancellation requested by the customer after acceptance.
  const askItem = await stocked(request, "QCXL", 2);
  const asked = await order(request, askItem, 1);
  await move(request, asked.id, ["confirmed"]);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const mine = await (await request.get(`${API}/orders/${asked.id}`, { headers })).json();
  const requested = await request.post(`${API}/orders/${asked.id}/cancellation-request`, { headers, data: { version: mine.version, reason: "Changed my mind" } });
  expect(requested.ok(), await requested.text()).toBe(true);

  await uiLoginAsAdmin(page);
  await expectInQueue(page, "attention", short.order_number, true);
  await expectInQueue(page, "attention", asked.order_number, false);
  await expectInQueue(page, "cancellation", asked.order_number, true);
  await expectInQueue(page, "cancellation", short.order_number, false);
  await expectQueueCount(page, request, "attention");
  await expectQueueCount(page, request, "cancellation");
  // "All orders" is not a queue: both are there.
  await page.goto(`/orders?q=${short.order_number}`);
  await expect(page.locator(`[data-order-number="${short.order_number}"]`)).toHaveCount(1);
});

/* --------------------------------------------------- delivery attempts */

test("the attempt history after fail → retry → fail keeps both failures with their reasons", async ({ page, request }) => {
  const item = await stocked(request, "ATT", 2);
  const placed = await order(request, item, 1);
  // Dispatch hands the goods over: the delivery is out (attempt 1).
  await dispatchOrder(request, placed);
  await agentMove(request, placed.delivery_id, "failed", "Customer not answering");
  await agentMove(request, placed.delivery_id, "out_for_delivery");
  await agentMove(request, placed.delivery_id, "failed", "Shop closed at the address");

  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  const attempts = page.getByTestId("delivery-attempt");
  await expect(attempts).toHaveCount(2);
  await expect(attempts.nth(0)).toHaveAttribute("data-status", "failed");
  await expect(attempts.nth(1)).toHaveAttribute("data-status", "failed");
  await expect(attempts.nth(0).getByTestId("delivery-attempt-reason")).toContainText("Customer not answering");
  await expect(attempts.nth(1).getByTestId("delivery-attempt-reason")).toContainText("Shop closed at the address");
  await expect(attempts.nth(0).getByTestId("delivery-attempt-party")).not.toBeEmpty();
});

/* ------------------------------------------------------- retrievals list */

test("the all-retrievals list filters by order, status, party and date on the server", async ({ page, request }) => {
  const item = await stocked(request, "RLIST", 2);
  const placed = await order(request, item, 1);
  await dispatchOrder(request, placed);
  await agentMove(request, placed.delivery_id, "failed", "Wrong address");
  const opened = await api(request, "POST", `/admin/orders/${placed.id}/retrievals`, { operation_id: `lc-rl-${run}`, outcome: "retry", reason: "Bring it back" });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  const number = opened.body.document_number as string;
  const row = () => page.locator('[data-testid="table-row"]', { has: page.locator(`[data-testid="retrieval-list-link"]`, { hasText: number }) });

  await uiLoginAsAdmin(page);
  // From the order: its own retrievals.
  await page.goto(`/orders/${placed.id}`);
  await page.getByTestId("order-retrievals-all").click();
  await expect(page).toHaveURL(new RegExp(`/retrievals\\?order_id=${placed.id}`));
  await expect(page.getByTestId("retrievals-order-filter")).toContainText(placed.order_number);
  await expect(row()).toHaveCount(1);
  await expect(page.locator('[data-testid="table-row"]')).toHaveCount(1);
  await expect(row().getByTestId("retrieval-list-status")).toHaveAttribute("data-status", "open");

  // Status: open includes it, received doesn't.
  await page.goto(`/retrievals?order_id=${placed.id}&status=open`);
  await expect(row()).toHaveCount(1);
  await page.goto(`/retrievals?order_id=${placed.id}&status=received`);
  await expect(row()).toHaveCount(0);

  // Date: today includes it; a range that ended yesterday doesn't.
  const day = today();
  await page.goto(`/retrievals?order_id=${placed.id}&from=${day}&to=${day}`);
  await expect(row()).toHaveCount(1);
  await page.goto(`/retrievals?order_id=${placed.id}&from=2001-01-01&to=2001-01-31`);
  await expect(row()).toHaveCount(0);

  // Party: from the row, the list narrows to that delivery party.
  await page.goto(`/retrievals?order_id=${placed.id}`);
  await row().getByTestId("retrieval-list-party").click();
  await expect(page).toHaveURL(new RegExp(`party_id=${state.agentId}`));
  await expect(row()).toHaveCount(1);
  const { body } = await api(request, "GET", `/admin/retrievals?party_id=${state.agentId}&per_page=100`);
  expect((body.data as Array<{ custody_party_id: string }>).every((entry) => entry.custody_party_id === state.agentId)).toBe(true);
  // The orders area links here too.
  await page.goto("/orders");
  await page.getByTestId("orders-tab-retrievals").click();
  await expect(page).toHaveURL(/\/retrievals$/);
});

/* ---------------------------------------------------------------- retrieval */

test("a failed delivery comes back by a partial retrieval", async ({ page, request }) => {
  const item = await stocked(request, "RET", 4);
  const placed = await order(request, item, 2);
  await dispatchOrder(request, placed);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  await act(page, "fail", "Customer not at the address");
  await expectStatus(page, "failed");
  await expect(page.getByTestId("delivery-failure")).toContainText("Customer not at the address");
  await expect(page.getByTestId("order-action-retry")).toBeVisible();
  await page.getByTestId("retrieval-open").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Bring it back to retry tomorrow");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await page.waitForURL(/\/retrievals\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("retrieval-detail")).toHaveAttribute("data-status", "open");
  await page.getByTestId("retrieval-quantity").fill("1");
  await page.getByTestId("retrieval-review").click();
  await page.getByTestId("retrieval-confirm").click();
  // Deterministic: the receipt reaches "posted", the refreshed document then
  // shows the new status — and the confirmation is STILL there afterwards.
  const receipt = page.getByTestId("retrieval-receipt");
  await expect(receipt).toHaveAttribute("data-phase", "posted");
  await expect(page.getByTestId("retrieval-detail")).toHaveAttribute("data-status", "partially_received");
  await expect(page.getByTestId("retrieval-received")).toHaveText("1");
  await expect(page.getByTestId("posting-done")).toBeVisible();
  // No second post: the confirm button is gone once posted.
  await expect(page.getByTestId("retrieval-confirm")).toHaveCount(0);

  // The rest comes back as a new receipt; the last one keeps its confirmation too.
  await page.getByTestId("retrieval-receive-more").click();
  await expect(receipt).toHaveAttribute("data-phase", "idle");
  await page.getByTestId("retrieval-quantity").fill("1");
  await page.getByTestId("retrieval-review").click();
  await page.getByTestId("retrieval-confirm").click();
  await expect(receipt).toHaveAttribute("data-phase", "posted");
  await expect(page.getByTestId("retrieval-detail")).toHaveAttribute("data-status", /^(received|closed)$/);
  await expect(page.getByTestId("retrieval-received")).toHaveText("2");
  await expect(page.getByTestId("posting-done")).toBeVisible();
  await expect(page.getByTestId("retrieval-receive-more")).toHaveCount(0);
  await expect(page.getByTestId("retrieval-confirm")).toHaveCount(0);
  // Exactly what was received, once each.
  const id = page.url().split("/").pop()!;
  const { body } = await api(request, "GET", `/admin/retrievals/${id}`);
  expect((body.lines as Array<{ received_quantity: number | string }>).reduce((sum, line) => sum + Number(line.received_quantity), 0)).toBe(2);
});

/* ---------------------------------------------------------------- below cost */

test("below cost: confirmation blocked, self-approval refused, a different approver approves with a reason", async ({ page, request }) => {
  // Sold at 1,000 but costing 5,000; ordered from the admin's own phone, so
  // the admin is this order's originator.
  const item = await stocked(request, "BELOW", 3, { price: 1000, cost: 5000 });
  const placed = await order(request, item, 1, ADMIN_PHONE);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${placed.id}`);
  await act(page, "accept");
  const panel = page.getByTestId("below-cost");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("below-cost-row")).toContainText(item.sku);
  await expect(panel.getByTestId("below-cost-cost-column")).toBeVisible();
  await panel.getByTestId("below-cost-approve").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Clearance price agreed");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expect(page.getByTestId("below-cost-self-refused")).toBeVisible();
  await expectStatus(page, "pending");

  await switchUser(page, state.approver!.username, state.approver!.password);
  await page.goto(`/orders/${placed.id}`);
  await act(page, "accept");
  await page.getByTestId("below-cost-approve").click();
  await page.locator("dialog[open]").getByTestId("confirm-reason").fill("Clearance price agreed by the manager");
  await page.locator("dialog[open]").getByTestId("confirm-submit").click();
  await expectStatus(page, "confirmed");
});
