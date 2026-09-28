import { expect, test, type Page } from "@playwright/test";
import { ACCESS_TOKEN, FakeApi, signInAs, type Role, type Seen } from "./fake-api";

/**
 * The notification center against a scripted API with a real SSE stream
 * (WORK_TESTS=true). The fake mirrors the server's inbox semantics: reads
 * are PATCHed, and every read is broadcast to each open stream of the user,
 * which is how two tabs — or a tab and a phone — stay in step.
 */

const api = new FakeApi();

test.beforeAll(async () => {
  await api.start();
});
test.afterAll(async () => {
  await api.stop();
});

interface Item {
  id: string;
  type: string;
  target_role: string;
  title_ar: string;
  body_ar: string;
  title_en: string;
  body_en: string;
  deep_link: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  read_at: string | null;
}

let inbox: Item[] = [];
let clock = Date.UTC(2026, 8, 28, 9);

function item(id: string, deepLink: string, role: Role | "staff" = "customer"): Item {
  clock += 60_000;
  return {
    id,
    type: "order_status_changed",
    target_role: role,
    title_ar: `إشعار ${id}`,
    body_ar: "تحديث على طلبك",
    title_en: `Notification ${id}`,
    body_en: "An update on your order",
    deep_link: deepLink,
    entity_type: "order",
    entity_id: "11111111-1111-4111-8111-111111111111",
    created_at: new Date(clock).toISOString(),
    read_at: null,
  };
}

function unreadCount(): number {
  return inbox.filter((entry) => !entry.read_at).length;
}

/** Deliver a new notification the way the server does: created, then count. */
function arrive(entry: Item): void {
  inbox.unshift(entry);
  api.emit("notification.created", entry);
  api.emit("unread.count", { unread_count: unreadCount() });
}

function broadcastRead(ids: string[], readAt: string): void {
  api.emit("notification.read", { notification_ids: ids, read_at: readAt, unread_count: unreadCount() });
  api.emit("unread.count", { unread_count: unreadCount() });
}

test.beforeEach(() => {
  api.reset();
  clock = Date.UTC(2026, 8, 28, 9);
  inbox = [
    item("n-3", "/orders/11111111-1111-4111-8111-111111111111"),
    item("n-2", "/orders/22222222-2222-4222-8222-222222222222"),
    { ...item("n-1", "/notifications"), read_at: new Date(clock).toISOString() },
  ].reverse();
  api.on("GET", /^\/me\/notifications\/unread-count$/, () => ({ body: { unread_count: unreadCount() } }));
  api.on("GET", /^\/me\/notifications$/, (seen: Seen) => {
    const unread = seen.query.get("unread") === "true";
    const data = (unread ? inbox.filter((entry) => !entry.read_at) : inbox).slice();
    return { body: { page: 1, per_page: 20, total: data.length, data } };
  });
  api.on("PATCH", /^\/me\/notifications\/read-all$/, () => {
    const readAt = new Date().toISOString();
    const ids = inbox.filter((entry) => !entry.read_at).map((entry) => entry.id);
    inbox = inbox.map((entry) => ({ ...entry, read_at: entry.read_at ?? readAt }));
    broadcastRead(ids, readAt);
    return { body: { updated: ids.length, read_at: readAt } };
  });
  api.on("PATCH", /^\/me\/notifications\/[^/]+\/read$/, (seen) => {
    const id = seen.path.split("/")[3];
    const readAt = new Date().toISOString();
    inbox = inbox.map((entry) => (entry.id === id ? { ...entry, read_at: entry.read_at ?? readAt } : entry));
    broadcastRead([id], readAt);
    return { body: { id, read_at: readAt } };
  });
  api.on("GET", /^\/(cart|wishlist)$/, () => ({ status: 404, body: { code: "NOT_FOUND", message: "n/a" } }));
});

async function openInbox(page: Page, role: Role = "customer") {
  await signInAs(page, role);
  await page.goto("/notifications");
  await expect(page.getByTestId("inbox-list")).toBeVisible();
  await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "open");
}

const bellBadge = (page: Page) => page.getByTestId("bell-badge");
const row = (page: Page, id: string) => page.locator(`[data-testid="inbox-item"][data-id="${id}"]`);

test("the bell shows the unread count for every signed-in role", async ({ page }) => {
  for (const role of ["customer", "delivery_agent", "order_monitor"] as const) {
    await signInAs(page, role);
    await page.goto(role === "customer" ? "/" : "/notifications");
    await expect(page.getByTestId("header-bell"), role).toBeVisible();
    await expect(bellBadge(page), role).toHaveText("2");
  }
});

test("a guest has no bell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-login")).toBeVisible();
  await expect(page.getByTestId("header-bell")).toHaveCount(0);
});

test("the stream uses a single-use ticket; the token never enters a URL", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await openInbox(page);

  const ticketRequest = api.requests("POST", /^\/notifications\/stream-ticket$/)[0];
  expect(ticketRequest.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  const stream = api.requests("GET", /^\/notifications\/stream$/)[0];
  expect(stream.query.get("ticket")).toBe(api.issuedTickets[0]);
  for (const url of urls) expect(url).not.toContain(ACCESS_TOKEN);
  expect(stream.url).not.toMatch(/token|bearer/i);
});

test("the list, the unread filter, mark one and mark all", async ({ page }) => {
  await openInbox(page);
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  await expect(row(page, "n-1")).toHaveAttribute("data-read", "true");

  await page.getByTestId("inbox-filter-unread").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(2);
  expect(api.requests("GET", /^\/me\/notifications$/).at(-1)!.query.get("unread")).toBe("true");

  await row(page, "n-2").getByTestId("inbox-mark-read").click();
  await expect(row(page, "n-2")).toHaveAttribute("data-read", "true");
  await expect(bellBadge(page)).toHaveText("1");
  expect(api.requests("PATCH", /\/read$/).map((seen) => seen.path)).toEqual(["/me/notifications/n-2/read"]);

  await page.getByTestId("inbox-mark-all").click();
  await expect(row(page, "n-3")).toHaveAttribute("data-read", "true");
  await expect(bellBadge(page)).toHaveCount(0);
  expect(api.requests("PATCH", /^\/me\/notifications\/read-all$/)).toHaveLength(1);
});

test("an arrival appears live, unread, and is never marked read by arriving", async ({ page }) => {
  await openInbox(page);
  await expect(bellBadge(page)).toHaveText("2");

  arrive(item("n-4", "/orders/33333333-3333-4333-8333-333333333333"));
  await expect(row(page, "n-4")).toBeVisible();
  await expect(row(page, "n-4")).toHaveAttribute("data-read", "false");
  await expect(page.getByTestId("inbox-item").first()).toHaveAttribute("data-id", "n-4");
  await expect(bellBadge(page)).toHaveText("3");

  await page.waitForTimeout(500);
  expect(api.requests("PATCH", /./)).toHaveLength(0);
});

test("reads sync live between two tabs", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await openInbox(first);
  await openInbox(second);

  await row(first, "n-3").getByTestId("inbox-mark-read").click();
  // The other tab learns it from its own stream — no reload.
  await expect(row(second, "n-3")).toHaveAttribute("data-read", "true");
  await expect(bellBadge(second)).toHaveText("1");

  // And an arrival reaches both.
  arrive(item("n-5", "/notifications"));
  await expect(row(first, "n-5")).toBeVisible();
  await expect(row(second, "n-5")).toBeVisible();
  await expect(bellBadge(first)).toHaveText("2");
  await expect(bellBadge(second)).toHaveText("2");

  await second.getByTestId("inbox-mark-all").click();
  await expect(row(first, "n-5")).toHaveAttribute("data-read", "true");
  await expect(bellBadge(first)).toHaveCount(0);
});

test("a dropped stream reconnects with a fresh ticket and loses nothing", async ({ page }) => {
  await openInbox(page);
  arrive(item("n-6", "/notifications"));
  await expect(row(page, "n-6")).toBeVisible();
  const lastSeen = api.events.at(-1)!.id;

  api.dropStreams();
  // Created while the tab was disconnected: only a replay can deliver it.
  const missed = item("n-7", "/notifications");
  inbox.unshift(missed);
  api.record("notification.created", missed);
  api.record("unread.count", { unread_count: unreadCount() });

  await expect(row(page, "n-7")).toBeVisible({ timeout: 10_000 });
  await expect(bellBadge(page)).toHaveText(String(unreadCount()));

  const tickets = api.requests("POST", /^\/notifications\/stream-ticket$/);
  expect(tickets.length).toBeGreaterThanOrEqual(2);
  const streams = api.requests("GET", /^\/notifications\/stream$/);
  const reconnect = streams[streams.length - 1];
  // A new ticket (the old one is spent), resuming after the last event seen.
  expect(reconnect.query.get("ticket")).not.toBe(streams[0].query.get("ticket"));
  expect(reconnect.query.get("since")).toBe(String(lastSeen));
});

test("a stream refused with a spent ticket is not retried with it", async ({ page }) => {
  await openInbox(page);
  api.dropStreams();
  await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "open", { timeout: 10_000 });
  const streams = api.requests("GET", /^\/notifications\/stream$/);
  const tickets = streams.map((seen) => seen.query.get("ticket"));
  expect(new Set(tickets).size).toBe(tickets.length);
});

test("the network going away and coming back resumes the stream", async ({ page, context }) => {
  await openInbox(page);
  await context.setOffline(true);
  await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "reconnecting");
  const missed = item("n-8", "/notifications");
  inbox.unshift(missed);
  api.emit("notification.created", missed);
  api.emit("unread.count", { unread_count: unreadCount() });
  await context.setOffline(false);
  await expect(row(page, "n-8")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("inbox")).toHaveAttribute("data-stream", "open");
});

test.describe("deep links per role", () => {
  test("a customer's order notification opens the account order page", async ({ page }) => {
    await openInbox(page);
    await row(page, "n-3").getByTestId("inbox-open").click();
    await expect(page).toHaveURL(/\/account\/orders\/11111111-1111-4111-8111-111111111111$/);
    await expect.poll(() => api.requests("PATCH", /\/n-3\/read$/).length).toBe(1);
  });

  test("a monitor's opens the monitor order page", async ({ page }) => {
    inbox.unshift(item("m-1", "/monitor/orders/44444444-4444-4444-8444-444444444444", "order_monitor"));
    api.on("GET", /^\/monitor\/orders\/[^/]+$/, () => ({ status: 404, body: { code: "NOT_FOUND", message: "x" } }));
    await openInbox(page, "order_monitor");
    await row(page, "m-1").getByTestId("inbox-open").click();
    await expect(page).toHaveURL(/\/monitor\/orders\/44444444-4444-4444-8444-444444444444$/);
  });

  test("an agent's opens the delivery page", async ({ page }) => {
    inbox.unshift(item("a-1", "/deliveries/55555555-5555-4555-8555-555555555555", "delivery_agent"));
    api.on("GET", /^\/deliveries\/assigned$/, () => ({ body: { page: 1, per_page: 100, total: 0, data: [] } }));
    await openInbox(page, "delivery_agent");
    await row(page, "a-1").getByTestId("inbox-open").click();
    await expect(page).toHaveURL(/\/deliveries\/55555555-5555-4555-8555-555555555555$/);
  });

  test("a link the store does not serve falls back to the inbox", async ({ page }) => {
    inbox.unshift(item("s-1", "/admin/orders/66666666-6666-4666-8666-666666666666", "staff"));
    await openInbox(page);
    await row(page, "s-1").getByTestId("inbox-open").click();
    await expect(page).toHaveURL(/\/notifications$/);
  });
});

test("a list that failed with the network recovers once the stream is back", async ({ page }) => {
  let calls = 0;
  api.on("GET", /^\/me\/notifications$/, () => {
    calls += 1;
    // Two: in development the first request is StrictMode's, aborted anyway.
    return calls <= 2 ? { status: 503, body: { code: "UNAVAILABLE", message: "down" } } : undefined;
  });
  await signInAs(page, "customer");
  await page.goto("/notifications");
  // No retry click: the stream coming up is what triggers the second fetch.
  await expect(page.getByTestId("inbox-list")).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(3);
});
