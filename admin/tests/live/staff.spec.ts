import { expect, test } from "@playwright/test";
import {
  API,
  adminApiToken,
  bearer,
  requireLiveApi,
  uiLoginAsAdmin,
  unique,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("creates a staff member with a preset", async ({ page, request }) => {
  const username = unique("ui");
  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-staff").click();
  await page.getByTestId("staff-new").click();

  await page.getByTestId("input-username").fill(username);
  await page.getByTestId("input-name").fill("موظف تجريبي");
  await page.getByTestId("input-email").fill(`${username}@example.com`);
  await page.getByTestId("generate-password").click();
  await expect(page.getByTestId("input-password")).not.toHaveValue("");
  await page.getByTestId("preset-catalog_editor").check();
  // A key the preset already grants is shown locked in the extra grants.
  await expect(page.getByTestId("perm-catalog.products")).toBeDisabled();
  await expect(page.getByTestId("perm-catalog.products")).toBeChecked();
  await page.getByTestId("perm-orders.view").check();
  await page.getByTestId("input-reason").fill("New catalog team member");
  await page.getByTestId("staff-create-submit").click();

  await expect(page).toHaveURL(/\/staff\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("toast")).toBeVisible();

  // Verified on the API, not just on screen.
  const staff = (await (
    await request.get(`${API}/admin/staff`, {
      headers: bearer(await adminApiToken(request)),
    })
  ).json()) as Array<{
    username: string;
    must_change_password: boolean;
    presets: Array<{ name: string }>;
    extra_grants: string[];
  }>;
  const created = staff.find((row) => row.username === username);
  expect(created).toBeTruthy();
  expect(created!.presets.map((preset) => preset.name)).toEqual([
    "catalog_editor",
  ]);
  expect(created!.extra_grants).toEqual(["orders.view"]);
  expect(created!.must_change_password).toBe(true);

  // Server-side search finds it from the list.
  await page.goto("/staff");
  await page.getByTestId("table-search").fill(username);
  await expect(page).toHaveURL(new RegExp(`q=${username.replace(".", "\\.")}`));
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  await expect(page.getByTestId("staff-username")).toHaveText(username);
});

test("a 422 lands next to its field and keeps every input", async ({
  page,
}) => {
  await uiLoginAsAdmin(page);
  await page.goto("/staff/new");
  // Starts with a digit — the contract's username pattern refuses it.
  await page.getByTestId("input-username").fill("9-not-valid");
  await page.getByTestId("input-name").fill("Keeps Me");
  await page.getByTestId("generate-password").click();
  await page.getByTestId("input-reason").fill("Checking validation");
  await page.getByTestId("staff-create-submit").click();

  await expect(page.getByTestId("error-username")).toBeVisible();
  await expect(page.getByTestId("input-username")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByTestId("input-username")).toHaveValue("9-not-valid");
  await expect(page.getByTestId("input-name")).toHaveValue("Keeps Me");
  await expect(page.getByTestId("input-reason")).toHaveValue(
    "Checking validation",
  );
  await expect(page).toHaveURL(/\/staff\/new$/);
});

test("the staff table pages, sorts and filters on the server", async ({
  page,
}) => {
  await uiLoginAsAdmin(page);
  await page.goto("/staff?per_page=10");
  await expect(page.getByTestId("table-range")).toContainText("1–");

  await page.getByTestId("sort-username").click();
  await expect(page).toHaveURL(/sort=username&dir=asc/);
  await page.getByTestId("sort-username").click();
  await expect(page).toHaveURL(/sort=username&dir=desc/);
  const usernames = await page.getByTestId("staff-username").allTextContents();
  expect(usernames).toEqual(
    [...usernames].sort((a, b) => b.localeCompare(a, "ar")),
  );

  await page.getByTestId("filter-status").selectOption("must_change");
  await expect(page).toHaveURL(/status=must_change/);
  for (const row of await page.getByTestId("table-row").all()) {
    await expect(row).toContainText("بانتظار تغيير كلمة المرور");
  }

  // The page jump accepts Arabic digits and refuses an ambiguous separator.
  const goTo = page.locator("#table-go-to");
  await goTo.fill("1,5");
  await goTo.blur();
  await expect(page.getByTestId("number-error")).toBeVisible();
  await goTo.fill("١");
  await goTo.blur();
  await expect(page.getByTestId("number-error")).toHaveCount(0);
});

test("deactivating needs a reason and a confirmation, then reactivates", async ({
  page,
  request,
}) => {
  const token = await adminApiToken(request);
  const username = unique("deact");
  const created = await request.post(`${API}/admin/staff`, {
    headers: bearer(token),
    data: {
      username,
      name: "To Deactivate",
      password: "Temp-Pass!123abcA",
      reason: "Live test setup",
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  await uiLoginAsAdmin(page);
  await page.goto(`/staff/${id}`);
  await page.getByTestId("staff-deactivate").click();
  // Only the open <dialog> is in the accessibility tree.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // No reason, no action.
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog.getByTestId("error-reason")).toBeVisible();
  await dialog.getByTestId("confirm-reason").fill("Left the company");
  await dialog.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("staff-reactivate")).toBeVisible();

  await page.getByTestId("staff-reactivate").click();
  await page
    .getByRole("dialog")
    .getByTestId("confirm-reason")
    .fill("Came back");
  await page.getByRole("dialog").getByTestId("confirm-submit").click();
  await expect(page.getByTestId("staff-deactivate")).toBeVisible();
});

test("on a phone the shell never scrolls sideways; the table scrolls in its card", async ({
  page,
}) => {
  await uiLoginAsAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/staff",
    "/presets",
    "/work-phones",
    "/staff/new",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width, path).toBeLessThanOrEqual(390);
  }
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  // The desktop aside is still in the DOM (hidden); the opened menu is the visible one.
  await expect(page.locator('[data-testid="nav-staff"]:visible')).toHaveCount(
    1,
  );
});
