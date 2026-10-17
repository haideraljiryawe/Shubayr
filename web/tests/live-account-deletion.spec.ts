import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  AGENT_E164,
  API,
  OTP,
  awaitQuota,
  bearer,
  requireLiveApi,
  staffToken,
  stockedProduct,
  tokenFor,
} from "./live-api";

/**
 * /account/delete against the real DELETE /me/account.
 *
 * Every test deletes (or tries to delete) a customer of its OWN — never the
 * worker's shared customer the other live specs order as. Each phone is
 * +964 7{role}{slot}{stamp}{n}, as in tests/live-api.ts, with role digits the
 * shared accounts don't use.
 */

const SLOT = Number(process.env.TEST_PARALLEL_INDEX ?? "0") % 10;
const STAMP = String(Math.floor(Date.now() / 1000) % 1_000_000).padStart(6, "0");

function freshPhone(role: "1" | "2" | "8" | "9") {
  const national = `7${role}${SLOT}${STAMP}${Math.floor(Math.random() * 10)}`;
  return { e164: `+964${national}`, local: `0${national}` };
}

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live account deletion spec");
  await awaitQuota(request);
});

/** Sign in with the API directly (not cached: the token dies with the account). */
async function apiSignIn(request: APIRequestContext, e164: string): Promise<{ token: string; id: string }> {
  await awaitQuota(request);
  await request.post(`${API}/auth/request-otp`, { data: { phone: e164 } });
  const verified = await request.post(`${API}/auth/verify-otp`, { data: { phone: e164, code: OTP, client: "web_store" } });
  expect(verified.ok(), await verified.text()).toBe(true);
  const body = await verified.json();
  return { token: body.access_token as string, id: body.user.id as string };
}

/** A COD order of one unit, placed as `token`'s customer; still pending. */
async function pendingOrder(request: APIRequestContext, token: string, e164: string) {
  const headers = bearer(token);
  const product = await stockedProduct(request, "DELETE");
  const governorates = (await (await request.get(`${API}/governorates`)).json()) as Array<{ id: string; is_served: boolean }>;
  const address = await request.post(`${API}/addresses`, {
    headers,
    data: {
      governorate_id: governorates.find((governorate) => governorate.is_served)?.id,
      label: "المنزل",
      city: "واسط",
      area: "الكوت",
      street: "شارع الجمهورية",
      contact_phone: e164,
      is_default: true,
    },
  });
  expect(address.ok(), await address.text()).toBe(true);
  const added = await request.post(`${API}/cart/items`, {
    headers,
    data: { product_id: product.id, variant_id: product.variant, quantity: 1 },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `live-delete-${Date.now()}-${Math.random()}` },
    data: { address_id: (await address.json()).id, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return (await placed.json()) as { id: string; version: number; delivery_id: string; total: number; items: Array<{ id: string }> };
}

/** Walk a pending order to delivered, the agent recording the cash as NOT yet confirmed. */
async function deliverUnconfirmed(request: APIRequestContext, order: { id: string; version: number; delivery_id: string }) {
  const admin = bearer(await staffToken(request));
  let version = order.version;
  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const moved = await request.patch(`${API}/admin/orders/${order.id}/status`, {
      headers: admin,
      data: {
        status,
        version,
        ...(status === "confirmed" ? { customer_contacted: true, customer_contact_note: "Customer confirmed by phone" } : {}),
      },
    });
    expect(moved.ok(), `${status}: ${await moved.text()}`).toBe(true);
    version = (await moved.json()).version;
  }
  const agent = await tokenFor(request, AGENT_E164);
  const me = await (await request.get(`${API}/me`, { headers: bearer(agent) })).json();
  const assigned = await request.patch(`${API}/deliveries/${order.delivery_id}/assign`, { headers: admin, data: { agent_id: me.id } });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  for (const status of ["out_for_delivery", "delivered"]) {
    const moved = await request.patch(`${API}/deliveries/${order.delivery_id}`, {
      headers: bearer(agent),
      data: {
        status,
        order_version: version,
        ...(status === "delivered"
          ? { operation_id: `live-delete-${order.delivery_id}`, collection_confirmation: "unconfirmed" }
          : {}),
      },
    });
    expect(moved.ok(), `${status}: ${await moved.text()}`).toBe(true);
    version = (await moved.json()).order_version;
  }
}

/** Sign in through the form on /account/delete itself, and reach the confirm step. */
async function signInOnPage(page: Page, local: string, path = "/account/delete") {
  await page.goto(path);
  await expect(page.getByTestId("delete-signed-out")).toBeVisible();
  await page.getByTestId("auth-phone").fill(local);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("delete-confirm")).toBeVisible();
}

async function confirmDeletion(page: Page) {
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
}

test("a customer deletes their account: signed out, the old session is dead, the phone starts afresh", async ({ page, request }) => {
  const phone = freshPhone("1");
  const before = await apiSignIn(request, phone.e164);

  await signInOnPage(page, phone.local);
  await confirmDeletion(page);
  await expect(page.getByTestId("delete-done")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("shubayr.session.v1"))).toBeNull();
  await expect(page.getByTestId("header-login")).toBeVisible();

  // Every session was revoked, including the one signed in beside the browser.
  const me = await request.get(`${API}/me`, { headers: bearer(before.token) });
  expect(me.status()).toBe(401);
  // The released phone signs in as a brand-new customer.
  const after = await apiSignIn(request, phone.e164);
  expect(after.id).not.toBe(before.id);
});

test("an open order refuses the deletion and says so; once it is cancelled the account goes", async ({ page, request }) => {
  const phone = freshPhone("2");
  const { token } = await apiSignIn(request, phone.e164);
  const order = await pendingOrder(request, token, phone.e164);

  await signInOnPage(page, phone.local, "/en/account/delete");
  await confirmDeletion(page);
  const blocked = page.getByTestId("delete-blocked");
  await expect(blocked).toContainText("Your account can't be deleted yet");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS")).toContainText("You have one open order");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS").locator("a")).toHaveAttribute("href", "/en/account/orders");
  await expect(blocked.locator("li")).toHaveCount(1);
  // Nothing was deleted: still signed in.
  expect(await page.evaluate(() => window.localStorage.getItem("shubayr.session.v1"))).not.toBeNull();

  const cancelled = await request.post(`${API}/orders/${order.id}/cancel`, { headers: bearer(token), data: { version: order.version } });
  expect(cancelled.ok(), await cancelled.text()).toBe(true);
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("delete-done")).toBeVisible();
  await expect(page.getByTestId("delete-done")).toContainText("Your account has been deleted");
});

test("an unconfirmed collection and a pending return each refuse the deletion, listed together", async ({ page, request }) => {
  const phone = freshPhone("8");
  const { token } = await apiSignIn(request, phone.e164);
  const order = await pendingOrder(request, token, phone.e164);
  await deliverUnconfirmed(request, order);

  await signInOnPage(page, phone.local);
  await confirmDeletion(page);
  let blocked = page.getByTestId("delete-blocked");
  await expect(blocked.getByTestId("delete-reason-UNSETTLED_AMOUNTS")).toContainText("مبالغ لم تُسوَّ");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS")).toHaveCount(0);
  await expect(blocked.getByTestId("delete-reason-PENDING_RETURNS")).toHaveCount(0);

  const requested = await request.post(`${API}/returns`, {
    headers: bearer(token),
    data: {
      order_id: order.id,
      operation_id: `live-delete-return-${order.id}`,
      items: [{ order_item_id: order.items[0].id, quantity: 1, reason: "Changed my mind", reason_code: "change_of_mind" }],
    },
  });
  expect(requested.ok(), await requested.text()).toBe(true);

  await page.getByTestId("delete-submit").click();
  blocked = page.getByTestId("delete-blocked");
  await expect(blocked.getByTestId("delete-reason-PENDING_RETURNS")).toContainText("لديك طلب إرجاع واحد قيد المعالجة");
  await expect(blocked.getByTestId("delete-reason-UNSETTLED_AMOUNTS")).toBeVisible();
  await expect(blocked.locator("li")).toHaveCount(2);
  expect(await page.evaluate(() => window.localStorage.getItem("shubayr.session.v1"))).not.toBeNull();
});
