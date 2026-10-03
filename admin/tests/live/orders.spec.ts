import { expect, test, type Page } from "@playwright/test";
import {
  activateStaff,
  advanceOrder,
  createStaff,
  orderStatus,
  placeOrder,
  requireLiveApi,
  setAccess,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Orders operations in a real browser, through the BFF, against a real API.
 * Every order is minted by the test, so re-runs never depend on seed state.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

async function confirm(page: Page, reason?: string) {
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByTestId("confirm-reason").fill(reason);
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeHidden();
}

const status = (page: Page) => page.getByTestId("order-detail");

test("the list filters and pages on the server", async ({ page, request }) => {
  const order = await placeOrder(request);
  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("orders-table")).toBeVisible();

  // Search alone: the order number.
  await page.getByTestId("table-search").fill(order.order_number);
  await expect(page).toHaveURL(new RegExp(`q=${order.order_number}`));
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  await expect(page.getByTestId("order-link")).toHaveAttribute(
    "data-order-number",
    order.order_number,
  );

  // Status alone.
  await page.goto("/orders?status=pending");
  const badges = page.getByTestId("orders-table").getByTestId("order-status");
  await expect(badges.first()).toBeVisible();
  for (const badge of await badges.all()) {
    await expect(badge).toHaveAttribute("data-status", "pending");
  }

  // Combined: status + search + today's date range still finds it…
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(
    `/orders?status=pending&q=${order.order_number}&from=${today}&to=${today}`,
  );
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  // …and a status it is not in empties the table.
  await page.getByTestId("filter-status").selectOption("delivered");
  await expect(page).toHaveURL(/status=delivered/);
  await expect(page.getByTestId("table-row")).toHaveCount(0);

  // An inverted range is explained, not sent as a 422.
  await page.goto("/orders?from=2026-09-10&to=2026-09-01");
  await expect(page.getByTestId("orders-invalid-range")).toBeVisible();
  await expect(page.getByTestId("orders-table")).toBeVisible();

  // Server pagination: a small page size gives more than one page.
  await page.goto("/orders?per_page=10");
  await expect(page.getByTestId("table-row")).toHaveCount(10);
  await expect(page.getByTestId("table-page")).toContainText("1");
});

test("every transition path, with the timeline", async ({ page, request }) => {
  const order = await placeOrder(request);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${order.id}`);
  await expect(status(page)).toHaveAttribute("data-status", "pending");
  // Pending offers accept, reject (its own route since #65) and cancel.
  await expect(page.getByTestId("order-action-reject")).toBeVisible();
  await expect(page.getByTestId("order-action-cancel")).toBeVisible();

  await page.getByTestId("order-action-accept").click();
  await confirm(page);
  await expect(status(page)).toHaveAttribute("data-status", "confirmed");

  await page.getByTestId("order-action-prepare").click();
  await confirm(page);
  await expect(status(page)).toHaveAttribute("data-status", "preparing");

  await page.getByTestId("order-action-markReady").click();
  await confirm(page);
  await expect(status(page)).toHaveAttribute("data-status", "ready_for_dispatch");

  // Handover needs an agent: the button explains, then assignment unblocks it.
  await expect(page.getByTestId("order-action-dispatch")).toBeDisabled();
  await expect(page.getByTestId("order-dispatch-blocked")).toBeVisible();
  await page.getByTestId("agent-option").first().click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("delivery-agent")).not.toHaveText(/بلا مندوب|No agent/);
  await expect(page.getByTestId("order-action-dispatch")).toBeEnabled();

  await page.getByTestId("order-action-dispatch").click();
  await confirm(page);
  await expect(status(page)).toHaveAttribute("data-status", "dispatched");
  // API 10.0: the delivery's outcome is recorded from here too (deliver or fail).
  await expect(page.getByTestId("order-action-deliver")).toBeVisible();
  await expect(page.getByTestId("order-action-fail")).toBeVisible();

  const timeline = page.getByTestId("timeline-event");
  for (const step of ["pending", "confirmed", "preparing", "ready_for_dispatch", "dispatched"]) {
    await expect(timeline.and(page.locator(`[data-status="${step}"]`)).first(), step).toBeVisible();
  }
  expect(await orderStatus(request, order.id)).toBe("dispatched");
});

test("cancel needs a reason, from pending and from later states", async ({ page, request }) => {
  const pending = await placeOrder(request);
  const preparing = await placeOrder(request);
  await advanceOrder(request, preparing.id, ["confirmed", "preparing"]);
  await uiLoginAsAdmin(page);

  for (const order of [pending, preparing]) {
    await page.goto(`/orders/${order.id}`);
    await page.getByTestId("order-action-cancel").click();
    const dialog = page.getByTestId("confirm-dialog");
    // Without a reason the dialog refuses and sends nothing.
    await dialog.getByTestId("confirm-submit").click();
    await expect(dialog).toBeVisible();
    await confirm(page, "Customer asked by phone");
    await expect(status(page)).toHaveAttribute("data-status", "cancelled");
    await expect(page.getByTestId("order-timeline")).toContainText("Customer asked by phone");
    expect(await orderStatus(request, order.id)).toBe("cancelled");
  }
});

test("a permission-limited user sees only allowed actions; a refusal is handled", async ({
  page,
  request,
}) => {
  const staff = await activateStaff(
    request,
    await createStaff(request, {
      permissionKeys: ["orders.view", "orders.accept", "orders.reject", "orders.assign_agent"],
      prefix: "orders-limited",
    }),
  );
  const pending = await placeOrder(request);
  const confirmed = await placeOrder(request);
  await advanceOrder(request, confirmed.id, ["confirmed"]);

  await uiLogin(page, staff.username, staff.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("nav-orders")).toBeVisible();

  // Pending: accept and reject — no cancel (no orders.cancel).
  await page.goto(`/orders/${pending.id}`);
  const actions = page.getByTestId("order-actions").getByRole("button");
  await expect(actions).toHaveCount(2);
  await expect(page.getByTestId("order-action-accept")).toBeVisible();
  await expect(page.getByTestId("order-action-reject")).toBeVisible();
  await expect(page.getByTestId("order-action-cancel")).toHaveCount(0);
  // Assigning needs orders.assign_agent only: the lookup works without
  // users.manage (#65), searched on the server.
  await expect(page.getByTestId("agent-option").first()).toBeVisible();
  await page.getByTestId("agent-search").fill("Delivery B");
  await expect(page.getByTestId("agent-option")).toHaveCount(1);
  await page.getByTestId("agent-option").first().click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("delivery-agent")).toContainText("Delivery B");

  // Confirmed: nothing this user may do.
  await page.goto(`/orders/${confirmed.id}`);
  await expect(page.getByTestId("order-no-actions")).toBeVisible();

  // The grant is revoked while the page is open; the API refuses the click.
  await page.goto(`/orders/${pending.id}`);
  await setAccess(request, staff.id, [], ["orders.view"]);
  await page.getByTestId("order-action-accept").click();
  await confirm(page);
  await expect(page.getByTestId("order-forbidden")).toBeVisible();
  await expect(page.getByTestId("order-no-actions")).toBeVisible();
  expect(await orderStatus(request, pending.id)).toBe("pending");
});

test("a concurrent change gives a clean conflict message", async ({ page, request }) => {
  const order = await placeOrder(request);
  await uiLoginAsAdmin(page);
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByTestId("order-action-accept")).toBeVisible();

  // Someone else accepts it first.
  await advanceOrder(request, order.id, ["confirmed"]);

  await page.getByTestId("order-action-accept").click();
  await confirm(page);
  const conflict = page.getByTestId("order-conflict");
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("مؤكد");
  // The page now offers what is possible now.
  await expect(status(page)).toHaveAttribute("data-status", "confirmed");
  await expect(page.getByTestId("order-action-prepare")).toBeVisible();
  // …and the message survives the refresh that brought the new state.
  await page.waitForTimeout(1000);
  await expect(conflict).toBeVisible();
});

test("reject: pending only, reason required, recorded as rejected", async ({ page, request }) => {
  const pending = await placeOrder(request);
  const confirmedOrder = await placeOrder(request);
  await advanceOrder(request, confirmedOrder.id, ["confirmed"]);
  await uiLoginAsAdmin(page);

  // Only pending orders can be rejected.
  await page.goto(`/orders/${confirmedOrder.id}`);
  await expect(page.getByTestId("order-action-prepare")).toBeVisible();
  await expect(page.getByTestId("order-action-reject")).toHaveCount(0);

  await page.goto(`/orders/${pending.id}`);
  await page.getByTestId("order-action-reject").click();
  const dialog = page.getByTestId("confirm-dialog");
  // No reason, no rejection.
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeVisible();
  await confirm(page, "Out of stock at the branch");
  await expect(status(page)).toHaveAttribute("data-status", "rejected");
  await expect(page.getByTestId("order-status").first()).toHaveText("مرفوض");
  await expect(page.getByTestId("order-timeline")).toContainText("Out of stock at the branch");
  await expect(page.getByTestId("order-no-actions")).toBeVisible();
  // Rejected — not cancelled — on the server too, and filterable in the list.
  expect(await orderStatus(request, pending.id)).toBe("rejected");
  await page.goto(`/orders?status=rejected&q=${pending.order_number}`);
  await expect(page.getByTestId("table-row")).toHaveCount(1);
});
