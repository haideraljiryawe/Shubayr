import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  ADMIN_PHONE,
  API,
  adminApiToken,
  bearer,
  placeOrder,
  requireLiveApi,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * The staff inbox, live, through the BFF.
 *
 * API 7.0 records no staff-targeted events yet (they come with order
 * lifecycle v2), so these specs drive the admin's inbox through its linked
 * user: the `admin` staff account and the admin's phone are one user, and an
 * order placed as that phone lands `order_placed` in the same inbox.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

async function unread(request: Parameters<typeof adminApiToken>[0]): Promise<number> {
  const response = await request.get(`${API}/me/notifications/unread-count`, {
    headers: bearer(await adminApiToken(request)),
  });
  return (await response.json()).unread_count as number;
}

async function newest(request: Parameters<typeof adminApiToken>[0]): Promise<{ id: string; deep_link: string }> {
  const response = await request.get(`${API}/me/notifications?per_page=1`, {
    headers: bearer(await adminApiToken(request)),
  });
  return (await response.json()).data[0];
}

async function adminSession(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: "ar",
  });
  const page = await context.newPage();
  await uiLoginAsAdmin(page);
  return page;
}

const bell = (page: Page) => page.getByTestId("header-bell");
const badge = (page: Page) => page.getByTestId("bell-badge");
const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

test("the browser holds no token or ticket; the stream is the BFF's", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await uiLoginAsAdmin(page);
  await expect(bell(page)).toHaveAttribute("data-stream", "open");

  const origin = new URL(page.url()).origin;
  const streams = urls.filter((url) => url.includes("/notifications/stream"));
  expect(streams.length).toBeGreaterThan(0);
  for (const url of streams) {
    expect(url.startsWith(`${origin}/api/notifications/stream`)).toBe(true);
    expect(url).not.toMatch(/ticket|token|Bearer/i);
  }
  // Nothing in the browser talks to the API directly, and no ticket route
  // is reachable through the general proxy.
  const apiOrigin = new URL(API).origin;
  expect(urls.filter((url) => url.startsWith(apiOrigin))).toEqual([]);
  const ticket = await page.request.post("/api/proxy/notifications/stream-ticket", {
    headers: { Origin: origin },
  });
  expect(ticket.status()).toBe(404);
  // The session cookies are httpOnly: page JavaScript cannot read them.
  expect(await page.evaluate(() => document.cookie)).not.toContain("shubayr_admin");
});

test("an arrival shows live in the bell and the dropdown, unread", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await expect(bell(page)).toHaveAttribute("data-stream", "open");
  await bell(page).click();
  await expect(page.getByTestId("inbox-panel")).toBeVisible();

  const order = await placeOrder(request, ADMIN_PHONE);
  const item = await newest(request);
  const row = page.locator(`[data-testid="inbox-item"][data-id="${item.id}"]`);
  await expect(row).toHaveAttribute("data-read", "false");
  await expect(badge(page)).toHaveText(badgeText(await unread(request)));

  // Opening it reads it and goes to the admin's page for that order.
  await row.getByTestId("inbox-open").click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByTestId("order-number")).toHaveText(order.order_number);
  await expect
    .poll(async () => {
      const after = await request.get(`${API}/me/notifications?per_page=10`, {
        headers: bearer(await adminApiToken(request)),
      });
      const entry = (await after.json()).data.find(
        (candidate: { id: string }) => candidate.id === item.id,
      );
      return entry?.read_at ?? null;
    })
    .not.toBeNull();
});

test("two sessions stay in step over the stream", async ({ browser, request }) => {
  const first = await adminSession(browser);
  const second = await adminSession(browser);
  for (const page of [first, second]) {
    await page.goto("/notifications");
    await expect(bell(page)).toHaveAttribute("data-stream", "open");
    await expect(page.getByTestId("inbox")).toBeVisible();
  }

  await placeOrder(request, ADMIN_PHONE);
  const item = await newest(request);
  const row = (page: Page) =>
    page.getByTestId("inbox").locator(`[data-testid="inbox-item"][data-id="${item.id}"]`);
  for (const page of [first, second]) {
    await expect(row(page)).toHaveAttribute("data-read", "false");
  }

  await row(first).getByTestId("inbox-mark-read").click();
  await expect(row(second)).toHaveAttribute("data-read", "true");
  const left = await unread(request);
  if (left > 0) await expect(badge(second)).toHaveText(badgeText(left));
  else await expect(badge(second)).toHaveCount(0);

  // Another arrival reaches both; "mark all" in one clears the other.
  await placeOrder(request, ADMIN_PHONE);
  const next = await newest(request);
  const nextRow = (page: Page) =>
    page.getByTestId("inbox").locator(`[data-testid="inbox-item"][data-id="${next.id}"]`);
  await expect(nextRow(first)).toHaveAttribute("data-read", "false");
  await expect(badge(first)).toHaveText(badgeText(await unread(request)));

  await second.getByTestId("inbox").getByTestId("inbox-mark-all").click();
  await expect(nextRow(first)).toHaveAttribute("data-read", "true");
  await expect(badge(first)).toHaveCount(0);
  expect(await unread(request)).toBe(0);

  await first.context().close();
  await second.context().close();
});

test("a dropped connection resumes without losing the event", async ({ page, context, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/notifications");
  await expect(bell(page)).toHaveAttribute("data-stream", "open");
  await expect(page.getByTestId("inbox")).toBeVisible();

  await context.setOffline(true);
  await expect(bell(page)).toHaveAttribute("data-stream", "reconnecting");
  await placeOrder(request, ADMIN_PHONE);
  const missed = await newest(request);
  await context.setOffline(false);

  await expect(
    page.getByTestId("inbox").locator(`[data-testid="inbox-item"][data-id="${missed.id}"]`),
  ).toBeVisible({ timeout: 15_000 });
  await expect(bell(page)).toHaveAttribute("data-stream", "open");
});
