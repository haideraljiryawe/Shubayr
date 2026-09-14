import { test, expect } from "@playwright/test";
for (const path of [
  "/categories",
  "/category/electronics",
  "/search?q=headphones",
]) {
  test(`recoverable data error at ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("alert")).toContainText(
      "تعذّر تحميل هذا القسم",
    );
    await expect(
      page.getByRole("button", { name: "حاول مرة أخرى" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "حاول مرة أخرى" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("search").filter({ visible: true }),
    ).toBeVisible();
  });
}
