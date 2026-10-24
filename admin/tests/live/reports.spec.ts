import { readFile } from "node:fs/promises";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  API,
  activateStaff,
  adminApiToken,
  bearer,
  createStaff,
  requireLiveApi,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";
import { REPORT_IDS } from "../../src/lib/reports";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`;
}

function digits(value: string | null): string {
  return (value ?? "").replace(/[^\d-]/g, "") || "0";
}

function wholeIqd(value: unknown): string {
  return String(value ?? "0").split(".")[0];
}

async function adminGet(request: APIRequestContext, path: string) {
  const response = await request.get(`${API}${path}`, { headers: bearer(await adminApiToken(request)) });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("owner dashboard and every report use the live API", async ({ page, request }) => {
  test.setTimeout(240_000);
  const day = today();
  const summary = await adminGet(request, "/admin/reports/dashboard");
  const sales = await adminGet(request, `/admin/reports/sales?from=${monthStart(day)}&to=${day}&group_by=day&page=1&per_page=20`);
  expect(Number(sales.totals.order_count), "the live report dataset has posted sales").toBeGreaterThan(0);

  await uiLoginAsAdmin(page);
  await expect(page.getByTestId("owner-dashboard-summary")).toBeVisible();
  await expect(page.getByTestId("waiting-calls")).toHaveAttribute("href", "/orders?status=pending");
  await expect(page.getByTestId("late-orders")).toHaveAttribute("href", "/orders?queue=late");
  await expect(page.getByTestId("low-stock")).toHaveAttribute("href", "/catalog/products?stock_state=low");
  await expect(page.getByTestId("payables-due")).toHaveAttribute("href", `/purchasing/reports?as_of=${summary.business_date}`);
  // One period selector drives the performance tiles; "This month" matches
  // the month's sales report.
  await page.goto("/?period=month");
  await expect(page.getByTestId("period-month")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("performance")).toHaveAttribute("data-period", "month");
  expect(digits(await page.getByTestId("perf-net-sales-value").textContent())).toBe(wholeIqd(sales.totals.net_sales));
  expect(digits(await page.getByTestId("perf-orders-value").textContent())).toBe(String(sales.totals.order_count));

  await page.goto("/reports");
  await expect(page.getByTestId("reports-hub")).toBeVisible();
  for (const report of REPORT_IDS) {
    await page.goto(`/reports/${report}?from=${monthStart(day)}&to=${day}&as_of=${day}`);
    await expect(page.getByTestId(`report-${report}`), report).toBeVisible();
    await expect(page.getByTestId("page-error"), report).toHaveCount(0);
    await expect(page.getByTestId("forbidden"), report).toHaveCount(0);
    await expect(page.getByTestId("report-table"), report).toBeVisible();
  }

  await page.goto(`/reports/sales?from=${monthStart(day)}&to=${day}&group_by=day`);
  await expect(page.getByTestId("report-total-net_sales")).toBeVisible();
  expect(digits(await page.getByTestId("report-total-net_sales").textContent())).toBe(wholeIqd(sales.totals.net_sales));
});

test("CSV and XLSX exports finish and download through the BFF", async ({ page }) => {
  test.setTimeout(360_000);
  const day = today();
  await uiLoginAsAdmin(page);
  await page.goto(`/reports/sales?from=${monthStart(day)}&to=${day}&group_by=day`);
  const buttons = page.getByTestId("report-export").locator("button");

  const csvEvent = page.waitForEvent("download", { timeout: 120_000 });
  await buttons.nth(0).click();
  const csv = await csvEvent;
  const csvPath = await csv.path();
  expect(csvPath).toBeTruthy();
  const csvBytes = await readFile(csvPath!);
  expect(csvBytes.length).toBeGreaterThan(10);
  expect(csvBytes.toString("utf8")).toMatch(/[\u0600-\u06ff]/);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);

  const xlsxEvent = page.waitForEvent("download", { timeout: 120_000 });
  await buttons.nth(1).click();
  const xlsx = await xlsxEvent;
  const xlsxPath = await xlsx.path();
  expect(xlsxPath).toBeTruthy();
  const xlsxBytes = await readFile(xlsxPath!);
  expect(xlsxBytes.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
});

test("a staff member without profit permission gets the standard 403 page", async ({ page, request }) => {
  const staff = await activateStaff(request, await createStaff(request, {
    prefix: "reports.sales.only",
    permissionKeys: ["reports.sales.read"],
  }));
  await switchUser(page, staff.username, staff.password);
  await page.goto("/reports/profitability");
  await expect(page.getByTestId("forbidden")).toBeVisible();
  await expect(page.getByTestId("report-profitability")).toHaveCount(0);
});
