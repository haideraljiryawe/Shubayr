import { expect, test, type Page } from "@playwright/test";
import { FakeApi, gate, signInAs, type Seen } from "./fake-api";

/**
 * The order-monitor and delivery-agent pages against a scripted API
 * (WORK_TESTS=true). Every filter is asserted on the request the server
 * received, because the server — not the page — does the filtering.
 */

const api = new FakeApi();

test.beforeAll(async () => {
  await api.start();
});
test.afterAll(async () => {
  await api.stop();
});

const STATUSES = ["pending", "confirmed", "preparing", "ready_for_dispatch", "delivered"] as const;
const NAMES = ["أحمد علي", "زينب حسن", "Sara Karim"];

/** 45 orders: enough for three pages of 20. */
const ORDERS = Array.from({ length: 45 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  order_number: `SH-${1000 + index}`,
  status: STATUSES[index % STATUSES.length],
  customer_name: NAMES[index % NAMES.length],
  customer_phone: `+96477000${String(index).padStart(5, "0")}`,
  total: 20 + index,
  payment_method: "cod",
  placed_at: new Date(Date.UTC(2026, 8, 28, 6) - index * 3_600_000 * 7).toISOString(),
}));

function storeDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(iso));
}

/** The server's filtering, so the page renders believable answers. */
function monitorPage(seen: Seen) {
  const q = (seen.query.get("q") ?? "").toLowerCase();
  const from = seen.query.get("date_from");
  const to = seen.query.get("date_to");
  const status = seen.query.get("status") ?? "all";
  const page = Number(seen.query.get("page") ?? 1);
  const perPage = Number(seen.query.get("per_page") ?? 20);
  const matching = ORDERS.filter(
    (order) =>
      (!q ||
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q)) &&
      (!from || storeDay(order.placed_at) >= from) &&
      (!to || storeDay(order.placed_at) <= to),
  );
  const status_counts: Record<string, number> = { all: matching.length };
  for (const order of matching) status_counts[order.status] = (status_counts[order.status] ?? 0) + 1;
  const filtered = status === "all" ? matching : matching.filter((order) => order.status === status);
  return {
    page,
    per_page: perPage,
    total: filtered.length,
    status_counts,
    data: filtered.slice((page - 1) * perPage, page * perPage),
  };
}

function monitorRequests(): Seen[] {
  return api.requests("GET", /^\/monitor\/orders$/);
}

function lastMonitorQuery(): URLSearchParams {
  const all = monitorRequests();
  return all[all.length - 1].query;
}

async function openMonitor(page: Page) {
  await signInAs(page, "order_monitor");
  await page.goto("/monitor/orders");
  await expect(page.getByTestId("monitor-results")).toBeVisible();
}

test.beforeEach(() => {
  api.reset();
  api.on("GET", /^\/me\/notifications\/unread-count$/, () => ({ body: { unread_count: 0 } }));
  api.on("GET", /^\/me\/notifications$/, () => ({
    body: { page: 1, per_page: 20, total: 0, data: [] },
  }));
  api.on("GET", /^\/monitor\/orders$/, (seen) => ({ body: monitorPage(seen) }));
});

test.describe("order monitor list", () => {
  test("renders the server's chip counts and first page", async ({ page }) => {
    await openMonitor(page);
    expect(lastMonitorQuery().get("status")).toBe("all");
    expect(lastMonitorQuery().get("page")).toBe("1");
    await expect(page.getByTestId("status-count-all")).toHaveText("45");
    await expect(page.getByTestId("status-count-pending")).toHaveText("9");
    await expect(page.getByTestId("status-count-cancelled")).toHaveText("0");
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(20);
    await expect(page.getByTestId("pager-label")).toContainText("3");
  });

  test("status filter alone", async ({ page }) => {
    await openMonitor(page);
    await page.getByTestId("status-chip-delivered").click();
    await expect.poll(() => lastMonitorQuery().get("status")).toBe("delivered");
    expect(lastMonitorQuery().get("q")).toBeNull();
    expect(lastMonitorQuery().get("date_from")).toBeNull();
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(9);
    for (const badge of await page.getByTestId("monitor-order-status").all()) {
      await expect(badge).toHaveAttribute("data-status", "delivered");
    }
    // Counts are computed without the status filter: the other chips keep theirs.
    await expect(page.getByTestId("status-count-pending")).toHaveText("9");
  });

  test("search alone is debounced into one request", async ({ page }) => {
    await openMonitor(page);
    const before = monitorRequests().length;
    await page.getByTestId("monitor-search").pressSequentially("sara", { delay: 40 });
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(15);
    const searches = monitorRequests().slice(before);
    // Four keystrokes inside the debounce window: one request, for the whole word.
    expect(searches.map((seen) => seen.query.get("q"))).toEqual(["sara"]);
    expect(lastMonitorQuery().get("status")).toBe("all");
  });

  test("search on an order number", async ({ page }) => {
    await openMonitor(page);
    await page.getByTestId("monitor-search").fill("SH-1044");
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(1);
    await expect(page.getByTestId("monitor-order-row")).toHaveAttribute("data-order-number", "SH-1044");
  });

  test("date range alone is sent as store-timezone days", async ({ page }) => {
    await openMonitor(page);
    await page.getByTestId("monitor-date-from").fill("2026-09-26");
    await page.getByTestId("monitor-date-to").fill("2026-09-27");
    await expect.poll(() => lastMonitorQuery().get("date_to")).toBe("2026-09-27");
    expect(lastMonitorQuery().get("date_from")).toBe("2026-09-26");
    expect(lastMonitorQuery().get("q")).toBeNull();
    const expected = ORDERS.filter((order) => {
      const day = storeDay(order.placed_at);
      return day >= "2026-09-26" && day <= "2026-09-27";
    }).length;
    await expect(page.getByTestId("status-count-all")).toHaveText(String(expected));

    // "Today" is the store's today, whatever zone the browser is in.
    await page.getByTestId("monitor-range-today").click();
    const today = storeDay(new Date().toISOString());
    await expect.poll(() => lastMonitorQuery().get("date_from")).toBe(today);
    expect(lastMonitorQuery().get("date_to")).toBe(today);
  });

  test("an impossible range is explained, not sent", async ({ page }) => {
    await openMonitor(page);
    const before = monitorRequests().length;
    await page.getByTestId("monitor-date-from").fill("2026-09-27");
    await page.getByTestId("monitor-date-to").fill("2026-09-20");
    await expect(page.getByTestId("monitor-range-invalid")).toBeVisible();
    await page.waitForTimeout(400);
    expect(
      monitorRequests().slice(before).some((seen) => seen.query.get("date_to") === "2026-09-20"),
    ).toBe(false);
  });

  test("filters combine, and every change returns to page 1", async ({ page }) => {
    await openMonitor(page);
    await page.getByTestId("pager-next").click();
    await expect.poll(() => lastMonitorQuery().get("page")).toBe("2");

    await page.getByTestId("status-chip-pending").click();
    await expect.poll(() => lastMonitorQuery().get("status")).toBe("pending");
    expect(lastMonitorQuery().get("page")).toBe("1");

    await page.getByTestId("monitor-search").fill("أحمد");
    await expect.poll(() => lastMonitorQuery().get("q")).toBe("أحمد");
    expect(lastMonitorQuery().get("status")).toBe("pending");
    expect(lastMonitorQuery().get("page")).toBe("1");

    await page.getByTestId("monitor-date-from").fill("2026-09-01");
    await expect.poll(() => lastMonitorQuery().get("date_from")).toBe("2026-09-01");
    const last = lastMonitorQuery();
    expect(last.get("status")).toBe("pending");
    expect(last.get("q")).toBe("أحمد");
    expect(last.get("page")).toBe("1");

    const expected = monitorPage({ query: last } as Seen);
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(expected.data.length);
    for (const badge of await page.getByTestId("monitor-order-status").all()) {
      await expect(badge).toHaveAttribute("data-status", "pending");
    }
  });

  test("a slow older search never overwrites a newer one, and is cancelled", async ({ page }) => {
    const slow = gate();
    api.on("GET", /^\/monitor\/orders$/, (seen) =>
      seen.query.get("q")?.toLowerCase() === "sh-100"
        ? { body: monitorPage(seen), wait: slow.promise }
        : undefined,
    );
    await openMonitor(page);
    const aborted: string[] = [];
    page.on("requestfailed", (request) => {
      if (request.url().includes("/monitor/orders")) aborted.push(new URL(request.url()).searchParams.get("q") ?? "");
    });

    await page.getByTestId("monitor-search").fill("SH-100");
    await expect.poll(() => api.requests("GET", /^\/monitor\/orders$/).some((seen) => seen.query.get("q") === "SH-100")).toBe(true);
    // While that one is held, a newer search is answered at once.
    await page.getByTestId("monitor-search").fill("SH-1044");
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(1);
    await expect(page.getByTestId("monitor-order-row")).toHaveAttribute("data-order-number", "SH-1044");

    // Now the old answer is released: it must not replace the new one.
    slow.release();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(1);
    await expect(page.getByTestId("monitor-order-row")).toHaveAttribute("data-order-number", "SH-1044");
    // …and the browser had already given up on it.
    expect(aborted).toContain("SH-100");
  });

  test("a slow search does not overwrite a status picked after it", async ({ page }) => {
    const slow = gate();
    api.on("GET", /^\/monitor\/orders$/, (seen) =>
      seen.query.get("q") === "zzz" ? { body: monitorPage(seen), wait: slow.promise } : undefined,
    );
    await openMonitor(page);
    await page.getByTestId("monitor-search").fill("zzz");
    await expect.poll(() => monitorRequests().some((seen) => seen.query.get("q") === "zzz")).toBe(true);
    await page.getByTestId("monitor-search").fill("");
    await page.getByTestId("status-chip-confirmed").click();
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(9);
    slow.release();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("monitor-order-row")).toHaveCount(9);
  });
});

test.describe("order monitor detail", () => {
  test("shows the order read-only: no images and no actions", async ({ page }) => {
    const order = ORDERS[3];
    api.on("GET", /^\/monitor\/orders\/[^/]+$/, () => ({
      body: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        customer: { name: order.customer_name, phone: order.customer_phone },
        shipping_snapshot: {
          contact_phone: "+9647701234567",
          address_label: "المنزل",
          city: "واسط",
          area: "الكوت",
          street: "شارع 14",
          details: "قرب الجامع",
          lat: null,
          lng: null,
        },
        items: [
          { id: "i1", product_id: "p1", variant_id: null, product_name_ar: "سماعات", product_name_en: "Earbuds", quantity: 2, unit_price: 10, line_total: 20 },
          { id: "i2", product_id: "p2", variant_id: null, product_name_ar: "شاحن", product_name_en: "Charger", quantity: 1, unit_price: 3, line_total: 3 },
        ],
        subtotal: 23,
        delivery_fee: 5,
        discount: 0,
        total: 28,
        payment_method: "cod",
        placed_at: order.placed_at,
      },
    }));
    await openMonitor(page);
    await page.getByTestId("monitor-order-row").nth(3).click();
    const detail = page.getByTestId("monitor-order-detail");
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/monitor/orders/${order.id}$`));
    await expect(page.getByTestId("monitor-detail-number")).toHaveText(order.order_number);
    await expect(page.getByTestId("monitor-detail-status")).toHaveAttribute("data-status", order.status);
    await expect(page.getByTestId("monitor-detail-customer")).toHaveText(order.customer_name);
    await expect(page.getByTestId("monitor-detail-phone")).toHaveText(order.customer_phone);
    await expect(page.getByTestId("monitor-detail-address")).toContainText("الكوت");
    await expect(page.getByTestId("monitor-detail-item")).toHaveCount(2);
    await expect(page.getByTestId("monitor-detail-qty").first()).toContainText("2");
    await expect(page.getByTestId("monitor-detail-total")).toContainText("28");
    await expect(page.getByTestId("monitor-detail-payment")).toHaveText("الدفع عند الاستلام");
    await expect(detail.locator("img")).toHaveCount(0);
    await expect(detail.locator("button, input, select, textarea, form")).toHaveCount(0);
    // Nothing on this page ever writes.
    expect(api.seen.filter((seen) => !["GET", "POST"].includes(seen.method) || (seen.method === "POST" && seen.path !== "/notifications/stream-ticket"))).toEqual([]);
  });
});

test.describe("work pages only for their role", () => {
  test("a customer is told the monitor pages are not theirs", async ({ page }) => {
    await signInAs(page, "customer");
    await page.goto("/monitor/orders");
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
    await page.goto("/deliveries");
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
    expect(monitorRequests()).toHaveLength(0);
    expect(api.requests("GET", /^\/deliveries/)).toHaveLength(0);
  });

  test("an agent cannot open the monitor pages, nor a monitor the agent's", async ({ page }) => {
    await signInAs(page, "delivery_agent");
    await page.goto("/monitor/orders");
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
    expect(monitorRequests()).toHaveLength(0);
  });

  test("a monitor cannot open the delivery pages", async ({ page }) => {
    await signInAs(page, "order_monitor");
    await page.goto("/deliveries");
    await expect(page.getByTestId("work-forbidden")).toBeVisible();
    expect(api.requests("GET", /^\/deliveries/)).toHaveLength(0);
  });

  test("a guest is sent to sign in", async ({ page }) => {
    await page.goto("/monitor/orders");
    await expect(page).toHaveURL(/\/login\?next=%2Fmonitor%2Forders/);
  });
});

test.describe("delivery agent", () => {
  const DELIVERY = {
    id: "d0000000-0000-4000-8000-000000000001",
    order_id: "o0000000-0000-4000-8000-000000000001",
    order_version: 1,
    agent_id: "u-agent",
    status: "assigned",
    delivery_fee: 5,
    dispatched_at: null as string | null,
    delivered_at: null as string | null,
  };

  function serveDeliveries(current: () => typeof DELIVERY) {
    api.on("GET", /^\/deliveries\/assigned$/, (seen) => {
      const status = seen.query.get("status");
      const data = [current()].filter((delivery) => !status || delivery.status === status);
      return { body: { page: 1, per_page: Number(seen.query.get("per_page") ?? 20), total: data.length, data } };
    });
  }

  test("lists assigned deliveries with a server-side status filter", async ({ page }) => {
    serveDeliveries(() => DELIVERY);
    await signInAs(page, "delivery_agent");
    await page.goto("/deliveries");
    await expect(page.getByTestId("delivery-row")).toHaveCount(1);
    await page.getByTestId("delivery-chip-delivered").click();
    await expect(page.getByText("لا توجد توصيلات")).toBeVisible();
    const last = api.requests("GET", /^\/deliveries\/assigned$/).at(-1)!;
    expect(last.query.get("status")).toBe("delivered");
  });

  test("offers only the API's transitions and walks them", async ({ page }) => {
    let current: typeof DELIVERY & { retry_count?: number; failure_reason?: string | null; failed_at?: string } = { ...DELIVERY };
    serveDeliveries(() => current);
    api.on("PATCH", /^\/deliveries\/[^/]+$/, (seen) => {
      const { status, reason } = seen.body as { status: string; reason?: string };
      // API 10.0: a failure keeps its reason; going out again is a retry.
      const retrying = current.status === "failed" && status === "out_for_delivery";
      current = {
        ...current,
        status,
        order_version: current.order_version + 1,
        dispatched_at: current.dispatched_at ?? new Date().toISOString(),
        ...(status === "failed" ? { failure_reason: reason ?? null, failed_at: new Date().toISOString() } : {}),
        retry_count: (current.retry_count ?? 0) + (retrying ? 1 : 0),
      };
      return { body: current };
    });
    await signInAs(page, "delivery_agent");
    await page.goto("/deliveries");
    await page.getByTestId("delivery-row").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "assigned");

    const actions = page.getByTestId("delivery-actions").getByRole("button");
    await expect(actions).toHaveCount(1);
    await page.getByTestId("delivery-action-out_for_delivery").click();
    await expect(page.getByTestId("delivery-confirm")).toBeVisible();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "out_for_delivery");
    expect(api.requests("PATCH", /^\/deliveries\//).at(-1)!.body).toEqual({
      status: "out_for_delivery",
      order_version: 1,
    });

    await expect(actions).toHaveCount(2);
    await expect(page.getByTestId("delivery-action-delivered")).toBeVisible();
    await expect(page.getByTestId("delivery-action-failed")).toBeVisible();
    // Nothing the API does not offer yet: no collected-amount or custody input.
    await expect(page.getByTestId("delivery-detail").locator("input, textarea, select")).toHaveCount(0);

    await page.getByTestId("delivery-action-failed").click();
    const failureReason = page.getByTestId("delivery-failure-reason");
    await expect(failureReason).toBeVisible();
    await expect(page.getByTestId("delivery-confirm-yes")).toBeDisabled();
    await failureReason.fill("Customer unavailable");
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "failed");
    expect(api.requests("PATCH", /^\/deliveries\//).at(-1)!.body).toEqual({
      status: "failed",
      order_version: 2,
      reason: "Customer unavailable",
    });
    // The failure stays on the page with its reason, and going out again is a retry.
    await expect(page.getByTestId("delivery-failure-text")).toHaveText("Customer unavailable");
    await expect(page.getByTestId("delivery-retry-count")).toHaveText("لم تُعد المحاولة بعد");
    await expect(page.getByTestId("delivery-action-out_for_delivery")).toHaveText("إعادة محاولة التوصيل");

    await page.getByTestId("delivery-action-out_for_delivery").click();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "out_for_delivery");
    await expect(page.getByTestId("delivery-retry-count")).toHaveText("أُعيدت المحاولة مرة");

    await page.getByTestId("delivery-action-delivered").click();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "delivered");
    await expect(page.getByTestId("delivery-action-returned")).toBeVisible();
  });

  test("cancelling the confirmation sends nothing", async ({ page }) => {
    serveDeliveries(() => DELIVERY);
    await signInAs(page, "delivery_agent");
    await page.goto(`/deliveries/${DELIVERY.id}`);
    await page.getByTestId("delivery-action-out_for_delivery").click();
    await page.getByTestId("delivery-confirm-no").click();
    await expect(page.getByTestId("delivery-confirm")).toHaveCount(0);
    expect(api.requests("PATCH", /^\/deliveries\//)).toHaveLength(0);
  });

  test("a 409 refreshes the delivery and explains why", async ({ page }) => {
    let current = { ...DELIVERY };
    serveDeliveries(() => current);
    api.on("PATCH", /^\/deliveries\/[^/]+$/, () => {
      // Staff handed it over from the Web Admin a moment earlier.
      current = { ...current, status: "out_for_delivery", dispatched_at: new Date().toISOString() };
      return { status: 409, body: { code: "CONFLICT", message: "Delivery status transition is not allowed" } };
    });
    await signInAs(page, "delivery_agent");
    await page.goto(`/deliveries/${DELIVERY.id}`);
    await page.getByTestId("delivery-action-out_for_delivery").click();
    await page.getByTestId("delivery-confirm-yes").click();
    await expect(page.getByTestId("delivery-conflict")).toBeVisible();
    await expect(page.getByTestId("delivery-status").first()).toHaveAttribute("data-status", "out_for_delivery");
    await expect(page.getByTestId("delivery-action-delivered")).toBeVisible();
  });
});
