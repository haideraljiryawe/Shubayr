import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  API,
  ADMIN_USERNAME,
  activateStaff,
  adminApiToken,
  bearer,
  createStaff,
  requireLiveApi,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * The audit-log screen and the staff / presets / work-phones tables, all
 * filtered and paged by the API. Expected totals are read back from the API
 * with the same parameters, so the page is compared with the server.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

function storeDay(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

/** The range label's text with Arabic-Indic digits made Latin and grouping removed. */
async function rangeText(page: import("@playwright/test").Page): Promise<string> {
  const text = (await page.getByTestId("table-range").textContent()) ?? "";
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[,٬]/g, "");
}

async function apiTotal(request: APIRequestContext, path: string): Promise<number> {
  const response = await request.get(`${API}${path}`, { headers: bearer(await adminApiToken(request)) });
  expect(response.ok(), path).toBe(true);
  return (await response.json()).total as number;
}

test("the audit log filters by actor, action, entity and date, on the server", async ({ page, request }) => {
  // Something to find: a staff account created with a known reason.
  const created = await createStaff(request, { permissionKeys: ["orders.view"], prefix: "audited" });

  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-table")).toBeVisible();

  // Action + entity + entity id together: exactly that record.
  await page.goto(`/audit?action=staff.create&entity_type=user&entity_id=${created.id}`);
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  await expect(page.getByTestId("audit-action")).toHaveText("staff.create");
  await expect(page.getByTestId("audit-reason")).toContainText("Admin live test setup");

  // Actor alone, through the debounced box: only the admin's records.
  await page.goto("/audit?per_page=10");
  await page.getByTestId("filter-actor").fill(ADMIN_USERNAME);
  await expect(page).toHaveURL(/actor=admin/);
  const byActor = await apiTotal(request, `/admin/audit-logs?actor=${ADMIN_USERNAME}&per_page=1`);
  await expect.poll(() => rangeText(page)).toContain(String(byActor));

  // Action alone, through the select.
  await page.getByTestId("filter-action").selectOption("staff.create");
  await expect(page).toHaveURL(/action=staff.create/);
  for (const cell of await page.getByTestId("audit-action").all()) {
    await expect(cell).toHaveText("staff.create");
  }

  // Date range: today includes the new record; yesterday alone does not.
  const today = storeDay();
  await page.goto(`/audit?entity_id=${created.id}&from=${today}&to=${today}`);
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  await page.goto(`/audit?entity_id=${created.id}&from=${storeDay(-1)}&to=${storeDay(-1)}`);
  await expect(page.getByTestId("table-row")).toHaveCount(0);
  await page.goto(`/audit?from=${today}&to=${storeDay(-3)}`);
  await expect(page.getByTestId("audit-invalid-range")).toBeVisible();

  // Server-side pagination: page 2 of 10 matches the API's own total.
  const total = await apiTotal(request, "/admin/audit-logs?per_page=10");
  await page.goto("/audit?per_page=10&page=2");
  await expect(page.getByTestId("table-row")).toHaveCount(Math.min(10, Math.max(0, total - 10)));
  if (total > 0) await expect.poll(() => rangeText(page)).toContain(String(total));
});

test("the audit log is only for audit.view", async ({ page, request }) => {
  const reader = await activateStaff(
    request,
    await createStaff(request, { permissionKeys: ["orders.view"], prefix: "no-audit" }),
  );
  await uiLogin(page, reader.username, reader.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("sidebar-nav").getByTestId("nav-audit")).toHaveCount(0);
  await page.goto("/audit");
  await expect(page.getByTestId("forbidden")).toHaveAttribute("data-status", "403");
});

test("staff, presets and work phones search, filter and page on the API", async ({ page, request }) => {
  // Make sure there are enough staff for two pages of 10, and some to search.
  for (let index = 0; index < 3; index += 1) {
    await createStaff(request, { permissionKeys: ["orders.view"], prefix: "paging" });
  }
  while ((await apiTotal(request, "/admin/staff?per_page=1")) < 12) {
    await createStaff(request, { permissionKeys: ["orders.view"], prefix: "paging" });
  }
  await uiLoginAsAdmin(page);

  // Staff: page 2 of 10, and a search, each matching the API's own totals.
  const staffTotal = await apiTotal(request, "/admin/staff?per_page=10");
  await page.goto("/staff?per_page=10&page=2");
  await expect(page.getByTestId("table-row")).toHaveCount(Math.min(10, Math.max(0, staffTotal - 10)));
  await expect.poll(() => rangeText(page)).toContain(String(staffTotal));
  await page.goto("/staff?q=paging.&per_page=100");
  const searched = await apiTotal(request, "/admin/staff?q=paging.&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(searched);
  await page.goto("/staff?status=must_change&per_page=100");
  const mustChange = await apiTotal(request, "/admin/staff?status=must_change&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(mustChange);

  // Presets: the kind filter and the permissions sort go to the API.
  await page.goto("/presets?kind=system&per_page=100");
  const system = await apiTotal(request, "/admin/presets?kind=system&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(system);
  await page.goto("/presets?kind=custom&per_page=100&sort=permissions&dir=desc");
  const custom = await apiTotal(request, "/admin/presets?kind=custom&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(custom);

  // Work phones: role filter and search.
  await page.goto("/work-phones?role=delivery_agent&per_page=100");
  const agents = await apiTotal(request, "/admin/work-phones?role=delivery_agent&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(agents);
  await page.goto("/work-phones?q=Delivery%20B&per_page=100");
  const searchedPhones = await apiTotal(request, "/admin/work-phones?q=Delivery%20B&per_page=100");
  await expect(page.getByTestId("table-row")).toHaveCount(searchedPhones);

  // A hand-edited, invalid filter is ignored rather than breaking the page.
  await page.goto("/staff?status=sleeping&preset=not-a-uuid");
  await expect(page.getByTestId("staff-table")).toBeVisible();
});
