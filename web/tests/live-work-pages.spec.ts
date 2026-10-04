import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import {
  AGENT_E164,
  AGENT_LOCAL,
  API,
  CUSTOMER_E164,
  CUSTOMER_LOCAL,
  MONITOR_E164,
  MONITOR_LOCAL,
  advanceOrder,
  assignToAgent,
  awaitQuota,
  bearer,
  placeOrder,
  requireLiveApi,
  signIn,
  staffToken,
  tokenFor,
} from "./live-api";

/**
 * The work pages and the notification center against the REAL API (6.1).
 *
 * Every order these tests look for is minted here, so the assertions never
 * lean on seed state an earlier run may have moved on. Expected numbers are
 * read back from the API with the monitor's own token, so the page is
 * compared with the server rather than with a hard-coded fixture.
 */

function storeDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

async function monitorCounts(
  request: APIRequestContext,
  query: Record<string, string> = {},
): Promise<{ total: number; status_counts: Record<string, number> }> {
  const token = await tokenFor(request, MONITOR_E164);
  const response = await request.get(`${API}/monitor/orders`, {
    headers: bearer(token),
    params: { per_page: "1", ...query },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** The cash the signed-in agent holds, from their own custody read. */
async function agentCash(request: APIRequestContext, token: string): Promise<number> {
  const custody = await (await request.get(`${API}/deliveries/custody`, { headers: bearer(token) })).json();
  return Number(custody.cash.amount);
}

async function newSession(browser: Browser, phoneLocal: string, next: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, next, phoneLocal);
  return page;
}

test.describe("work pages on the live store", () => {
  test.beforeEach(async ({ request }) => {
    await requireLiveApi(request, "the work-pages suite");
    await awaitQuota(request);
  });

  test("the API refuses each work endpoint to every other role", async ({ request }) => {
    const customer = await tokenFor(request, CUSTOMER_E164);
    const agent = await tokenFor(request, AGENT_E164);
    const monitor = await tokenFor(request, MONITOR_E164);
    const cases: Array<[string, string, number]> = [
      [customer, "/monitor/orders", 403],
      [customer, "/deliveries/assigned", 403],
      [agent, "/monitor/orders", 403],
      [monitor, "/deliveries/assigned", 403],
      [monitor, "/monitor/orders", 200],
      [agent, "/deliveries/assigned", 200],
    ];
    for (const [token, path, status] of cases) {
      const response = await request.get(`${API}${path}`, { headers: bearer(token) });
      expect(response.status(), path).toBe(status);
    }
  });

  test("the work pages show only to their role", async ({ page }) => {
    await signIn(page, "/monitor/orders", CUSTOMER_LOCAL);
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
    await page.goto("/deliveries");
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
  });

  test("an agent is kept off the monitor pages", async ({ page }) => {
    await signIn(page, "/monitor/orders", AGENT_LOCAL);
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
  });

  // @global: compares the store-wide order counts every monitor sees, which
  // other workers' orders would move mid-test — it runs alone, after the rest.
  test("the monitor list: chips, each filter alone, and combined", { tag: "@global" }, async ({ page, request }) => {
    const fresh = await placeOrder(request);
    const all = await monitorCounts(request);

    await signIn(page, "/monitor/orders", MONITOR_LOCAL);
    await expect(page.getByTestId("monitor-results")).toBeVisible();
    await expect(page.getByTestId("status-count-all")).toHaveText(String(all.status_counts.all));
    for (const status of ["pending", "confirmed", "delivered", "cancelled"]) {
      await expect(page.getByTestId(`status-count-${status}`), status).toHaveText(
        String(all.status_counts[status] ?? 0),
      );
    }

    // Status alone.
    await page.getByTestId("status-chip-pending").click();
    const pending = all.status_counts.pending;
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(Math.min(pending, 20));
    for (const badge of await page.getByTestId("monitor-order-status").all()) {
      await expect(badge).toHaveAttribute("data-status", "pending");
    }

    // Search alone (debounced): the fresh order by its number.
    await page.getByTestId("status-chip-all").click();
    await page.getByTestId("monitor-search").pressSequentially(fresh.order_number, { delay: 20 });
    await expect(page.locator(`[data-order-number="${fresh.order_number}"]`)).toHaveCount(1);
    const searched = await monitorCounts(request, { q: fresh.order_number });
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(Math.min(searched.total, 20));

    // Date alone: today in the store's timezone, compared with the server.
    await page.getByTestId("monitor-search").fill("");
    await page.getByTestId("monitor-range-today").click();
    const today = await monitorCounts(request, { date_from: storeDay(), date_to: storeDay() });
    await expect(page.getByTestId("status-count-all")).toHaveText(String(today.status_counts.all));

    // Combined: status + search + date narrows to the one fresh order…
    await page.getByTestId("status-chip-pending").click();
    await page.getByTestId("monitor-search").fill(fresh.order_number);
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(1);
    await expect(page.getByTestId("monitor-order-row")).toHaveAttribute("data-order-number", fresh.order_number);
    // …and a status it is not in empties the list without losing the others.
    await page.getByTestId("status-chip-delivered").click();
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(0);
    await expect(page.getByTestId("status-count-pending")).not.toHaveText("0");

    // The detail: read-only, no images, no controls.
    await page.getByTestId("status-chip-pending").click();
    await page.getByTestId("monitor-order-row").click();
    const detail = page.getByTestId("monitor-order-detail");
    await expect(page.getByTestId("monitor-detail-number")).toHaveText(fresh.order_number);
    await expect(page.getByTestId("monitor-detail-item").first()).toBeVisible();
    await expect(detail.locator("img")).toHaveCount(0);
    await expect(detail.locator("button, input, select, textarea")).toHaveCount(0);
  });

  test("an agent walks an assigned delivery from the notification", async ({ page, request }) => {
    const order = await placeOrder(request);
    await advanceOrder(request, order.id, ["confirmed", "preparing", "ready_for_dispatch"]);
    await assignToAgent(request, order.delivery_id);
    await awaitQuota(request);

    await signIn(page, "/notifications", AGENT_LOCAL);
    const item = page.locator('[data-testid="inbox-item"][data-read="false"]').first();
    await expect(item).toBeVisible();
    await item.getByTestId("inbox-open").click();
    await expect(page).toHaveURL(new RegExp(`/deliveries/${order.delivery_id}$`));
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "assigned");

    await page.getByTestId("delivery-action-out_for_delivery").click();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "out_for_delivery");
    // Delivered asks what was collected (12.0): the full amount here.
    const agentToken = await tokenFor(request, AGENT_E164);
    const cashBefore = await agentCash(request, agentToken);
    await page.getByTestId("delivery-action-delivered").click();
    await page.getByTestId("delivery-collected-amount").fill(String(order.total));
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "delivered");
    await expect(page.getByTestId("delivery-collection")).toHaveAttribute("data-status", "confirmed_full");
    await expect(page.getByTestId("delivery-collection-shortfall")).toHaveCount(0);
    expect(await agentCash(request, agentToken)).toBe(cashBefore + order.total);

    const customer = await tokenFor(request, CUSTOMER_E164);
    const fresh = await (
      await request.get(`${API}/orders/${order.id}`, { headers: bearer(customer) })
    ).json();
    expect(fresh.status).toBe("delivered");
  });

  test("an agent's custody page shows only their own goods", async ({ page, request }) => {
    test.setTimeout(120_000);
    const admin = bearer(await staffToken(request));
    // One order handed to the agent, one to an external driver.
    const mine = await placeOrder(request);
    await advanceOrder(request, mine.id, ["confirmed", "preparing", "ready_for_dispatch"]);
    await assignToAgent(request, mine.delivery_id);
    await advanceOrder(request, mine.id, ["dispatched"]);
    const driver = await (
      await request.post(`${API}/admin/external-drivers`, {
        headers: admin,
        data: { name: `Web live driver ${Date.now()}`, phone: `+964789${String(Date.now()).slice(-7)}` },
      })
    ).json();
    const theirs = await placeOrder(request);
    await advanceOrder(request, theirs.id, ["confirmed", "preparing", "ready_for_dispatch"]);
    const assigned = await request.patch(`${API}/deliveries/${theirs.delivery_id}/assign`, {
      headers: admin,
      data: { party_id: driver.id },
    });
    expect(assigned.ok(), await assigned.text()).toBe(true);
    await advanceOrder(request, theirs.id, ["dispatched"]);
    await awaitQuota(request);

    await signIn(page, "/deliveries/custody", AGENT_LOCAL);
    const agent = await tokenFor(request, AGENT_E164);
    const me = await (await request.get(`${API}/me`, { headers: bearer(agent) })).json();
    await expect(page.getByTestId("my-custody")).toHaveAttribute("data-party", me.id);
    await expect(page.locator(`[data-testid="my-custody-line"][data-order="${mine.order_number}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-testid="my-custody-line"][data-order="${theirs.order_number}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="my-custody-delivery"][data-delivery-id="${mine.delivery_id}"]`)).toHaveCount(1);

    // The API agrees: only the agent's own party, no cost, and no way to
    // read another party's custody.
    const own = await (await request.get(`${API}/deliveries/custody`, { headers: bearer(agent) })).json();
    expect(own.party.id).toBe(me.id);
    const orders = (own.goods.lines as Array<{ order: { order_number: string }; unit_cost_iqd?: number }>).map((line) => line.order.order_number);
    expect(orders).toContain(mine.order_number);
    expect(orders).not.toContain(theirs.order_number);
    expect(own.goods.value_iqd).toBeUndefined();
    expect((own.goods.lines as Array<{ unit_cost_iqd?: number }>).every((line) => line.unit_cost_iqd === undefined)).toBe(true);
    const other = await request.get(`${API}/admin/delivery-parties/${driver.id}/custody`, { headers: bearer(agent) });
    expect([401, 403]).toContain(other.status());
  });

  test("an agent delivers short: the shortfall is shown and only the cash collected is in their custody", async ({ page, request }) => {
    const order = await placeOrder(request);
    await advanceOrder(request, order.id, ["confirmed", "preparing", "ready_for_dispatch"]);
    await assignToAgent(request, order.delivery_id);
    await advanceOrder(request, order.id, ["dispatched"]);
    const agentToken = await tokenFor(request, AGENT_E164);
    const cashBefore = await agentCash(request, agentToken);
    const collected = Math.floor(order.total / 2);
    await awaitQuota(request);

    await signIn(page, `/deliveries/${order.delivery_id}`, AGENT_LOCAL);
    await page.getByTestId("delivery-action-delivered").click();
    await page.getByTestId("delivery-collected-amount").fill(String(collected));
    await page.getByTestId("delivery-confirm-yes").click();
    const result = page.getByTestId("delivery-collection");
    await expect(result).toHaveAttribute("data-status", "confirmed_short");
    await expect(page.getByTestId("delivery-collection-shortfall")).toContainText(
      new Intl.NumberFormat("en-US").format(order.total - collected),
    );
    // Only what was collected went into the agent's cash custody.
    expect(await agentCash(request, agentToken)).toBe(cashBefore + collected);
    await page.getByTestId("work-nav-home").click();
    await page.getByTestId("agent-tab-custody").click();
    await expect(page.getByTestId("my-custody-cash")).toContainText(
      new Intl.NumberFormat("en-US").format(cashBefore + collected),
    );
  });

  test("a stale delivery action is refused and explained", async ({ page, request }) => {
    const order = await placeOrder(request);
    await advanceOrder(request, order.id, ["confirmed", "preparing", "ready_for_dispatch"]);
    await assignToAgent(request, order.delivery_id);

    await signIn(page, `/deliveries/${order.delivery_id}`, AGENT_LOCAL);
    await expect(page.getByTestId("delivery-action-out_for_delivery")).toBeVisible();
    // Staff hand it over from the Web Admin while the agent's page is open.
    await advanceOrder(request, order.id, ["dispatched"]);

    await page.getByTestId("delivery-action-out_for_delivery").click();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-conflict")).toBeVisible();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "out_for_delivery");
  });
});

test.describe("notification center on the live store", () => {
  test.beforeEach(async ({ request }) => {
    await requireLiveApi(request, "the notification-center suite");
    await awaitQuota(request);
  });

  // @global: counts unread notifications, and every order any worker places
  // notifies every monitor — it runs alone, after the rest.
  test("two sessions stay in step: arrival and read sync live", { tag: "@global" }, async ({ browser, request }) => {
    const first = await newSession(browser, MONITOR_LOCAL, "/notifications");
    const second = await newSession(browser, MONITOR_LOCAL, "/notifications");
    for (const page of [first, second]) {
      await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "open");
    }

    // Two arrivals: one is read below, the other keeps "mark all" something
    // to do — this worker's monitor may be new, with no older notifications.
    await placeOrder(request);
    await placeOrder(request);
    const monitor = await tokenFor(request, MONITOR_E164);
    const newest = (
      await (
        await request.get(`${API}/me/notifications?per_page=1`, { headers: bearer(monitor) })
      ).json()
    ).data[0];
    const row = (page: Page) => page.locator(`[data-testid="inbox-item"][data-id="${newest.id}"]`);

    // It arrives in both, unread — arriving never reads it.
    for (const page of [first, second]) {
      await expect(row(page)).toHaveAttribute("data-read", "false");
    }
    const unread = async () =>
      (
        await (
          await request.get(`${API}/me/notifications/unread-count`, { headers: bearer(monitor) })
        ).json()
      ).unread_count as number;
    const before = await unread();
    expect(before).toBeGreaterThan(0);
    await expect(second.getByTestId("bell-badge")).toHaveText(String(before > 99 ? "99+" : before));

    // Read in one session: the other follows over its own stream.
    await row(first).getByTestId("inbox-mark-read").click();
    await expect(row(second)).toHaveAttribute("data-read", "true");
    const after = await unread();
    expect(after).toBe(before - 1);
    if (after > 0) {
      await expect(second.getByTestId("bell-badge")).toHaveText(String(after > 99 ? "99+" : after));
    } else {
      await expect(second.getByTestId("bell-badge")).toHaveCount(0);
    }

    // Mark all in the second; the first empties its badge.
    await second.getByTestId("inbox-mark-all").click();
    await expect(first.getByTestId("bell-badge")).toHaveCount(0);
    expect(await unread()).toBe(0);

    await first.context().close();
    await second.context().close();
  });

  test("a dropped stream reconnects with `since` and loses nothing", async ({ page, request, context }) => {
    const streams: string[] = [];
    page.on("request", (sent) => {
      if (sent.url().includes("/notifications/stream?")) streams.push(sent.url());
    });
    // This worker's monitor exists, then has at least one notification.
    await tokenFor(request, MONITOR_E164);
    await placeOrder(request);
    await signIn(page, "/notifications", MONITOR_LOCAL);
    await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "open");
    await expect(page.getByTestId("inbox-item").first()).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "reconnecting");
    // Created while this tab is disconnected.
    await placeOrder(request);
    const monitor = await tokenFor(request, MONITOR_E164);
    const missed = (
      await (
        await request.get(`${API}/me/notifications?per_page=1`, { headers: bearer(monitor) })
      ).json()
    ).data[0];
    await context.setOffline(false);

    await expect(page.locator(`[data-testid="inbox-item"][data-id="${missed.id}"]`)).toBeVisible({
      timeout: 15_000,
    });
    const reconnect = new URL(streams[streams.length - 1]);
    expect(streams.length).toBeGreaterThanOrEqual(2);
    expect(reconnect.searchParams.get("since")).toMatch(/^\d+$/);
    // Never the token: only a ticket, and a different one each time.
    for (const url of streams) {
      expect(new URL(url).searchParams.get("ticket")).toBeTruthy();
      expect(url).not.toMatch(/access_token|Bearer/i);
    }
    expect(new Set(streams.map((url) => new URL(url).searchParams.get("ticket"))).size).toBe(streams.length);
  });
});
