import { test, expect, type Page } from "@playwright/test";

/** The section's error card (Next's route announcer is a role="alert" too). */
const sectionError = (page: Page) => page.getByRole("alert").filter({ hasText: "تعذّر تحميل هذا القسم" });
for (const path of [
  "/categories",
  "/category/electronics",
  "/search?q=headphones",
]) {
  test(`recoverable data error at ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(sectionError(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "حاول مرة أخرى" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "حاول مرة أخرى" }).click();
    await expect(sectionError(page)).toBeVisible();
    await expect(
      page.getByRole("search").filter({ visible: true }),
    ).toBeVisible();
  });
}

// NOTE-001: a dead banner feed hides the banner section and nothing else —
// no empty carousel, no error box where the banners would be.
test("a failing banner feed leaves the rest of the home page", async ({ page }) => {
  await page.goto("/");
  // The page itself is there: header search and the categories strip (which
  // shows its own error card, the API being down for it too).
  await expect(page.getByRole("search").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("تعذّر تحميل هذا القسم").first()).toBeVisible();
  await expect(page.getByTestId("hero-banner")).toHaveCount(0);
  await expect(page.locator('[aria-roledescription="carousel"]')).toHaveCount(0);
});
