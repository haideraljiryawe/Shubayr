import { expect, test } from "./fixtures";
import {
  API,
  adminApiToken,
  bearer,
  requireLiveApi,
  uiLoginAsAdmin,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("creates a preset from grouped permissions, edits it, and deletes it", async ({
  page,
  request,
}) => {
  const name = `live_${Date.now().toString(36)}`;
  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-presets").click();
  await page.getByTestId("preset-new").click();

  await page.getByTestId("input-name").fill(name);
  await page
    .getByTestId("input-description")
    .fill("Order desk for the live suite");
  // The whole "orders" area in one click, then one key back out.
  const orders = page.locator('fieldset[data-group="orders"]');
  await orders.locator("legend input[type=checkbox]").check();
  await page.getByTestId("perm-orders.cancel").uncheck();
  await page.getByTestId("input-reason").fill("Live test preset");
  await page.getByTestId("preset-save").click();
  await expect(page).toHaveURL(/\/presets\/[0-9a-f-]{36}$/);

  const token = await adminApiToken(request);
  const read = async () =>
    (
      (await (
        await request.get(`${API}/admin/presets`, { headers: bearer(token) })
      ).json()) as Array<{
        id: string;
        name: string;
        permissions: Array<{ permission: { key: string } }>;
      }>
    ).find((preset) => preset.name === name);
  const created = await read();
  const keys = created!.permissions.map((entry) => entry.permission.key);
  expect(keys).toContain("orders.view");
  expect(keys).toContain("orders.accept");
  expect(keys).not.toContain("orders.cancel");
  expect(keys.every((key) => key.startsWith("orders."))).toBe(true);

  // Edit: add a key from another area.
  await page.getByTestId("perm-reports.view").check();
  await page.getByTestId("input-reason").fill("Add reports");
  await page.getByTestId("preset-save").click();
  await expect(page.getByTestId("toast")).toBeVisible();
  await expect
    .poll(async () =>
      (await read())!.permissions.map((entry) => entry.permission.key),
    )
    .toContain("reports.view");

  // Delete, behind a confirmation with a reason.
  await page.getByTestId("preset-delete").click();
  await page.getByTestId("confirm-reason").fill("Live test cleanup");
  await page.getByTestId("confirm-submit").click();
  await expect(page).toHaveURL(/\/presets$/);
  await expect.poll(read).toBeUndefined();
});

test("built-in presets cannot be deleted from the UI", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/presets?kind=system");
  await page.getByTestId("preset-edit-super_admin").click();
  await expect(page.getByTestId("preset-form")).toBeVisible();
  await expect(page.getByTestId("preset-delete")).toHaveCount(0);
});
