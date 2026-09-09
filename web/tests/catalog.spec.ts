import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const prefix of ["", "/en"]) {
  test(`missing category returns HTTP 404: ${prefix || "/ar"}`, async ({ page }) => {
    const response = await page.goto(`${prefix}/category/bogus-slug`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("product-grid")).toHaveCount(0);
  });

  test(`valid category returns HTTP 200: ${prefix || "/ar"}`, async ({ page }) => {
    const response = await page.goto(`${prefix}/category/electronics`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });
}

for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 1000],
] as const) {
  test(`catalog screenshots and navigation: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mkdir("docs/screenshots", { recursive: true });
    await page.goto("/categories");
    await expect(
      page.getByRole("heading", { name: "الأقسام", exact: true }),
    ).toBeVisible();
    const grid = page.getByRole("list", { name: "تصفح الأقسام" });
    await expect(grid.locator("li")).toHaveCount(8);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `docs/screenshots/categories-${name}.png`,
      fullPage: true,
      caret: "initial",
      style: "nextjs-portal { display: none !important; }",
    });
    await grid.getByRole("link", { name: "إلكترونيات", exact: true }).click();
    await expect(page).toHaveURL(/\/category\/electronics/);
    await expect(
      page.getByTestId("product-grid").locator(":scope > li"),
    ).toHaveCount(12);
    await expect(
      page.getByTestId("product-grid").getByText(/-\d+%/).first(),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page
      .getByTestId("product-grid")
      .locator("li")
      .last()
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll<HTMLImageElement>(
          '[data-testid="product-grid"] img',
        ),
      ].every((img) => img.complete && img.naturalWidth > 0),
    );
    await page.screenshot({
      path: `docs/screenshots/electronics-${name}.png`,
      fullPage: true,
      caret: "initial",
      style: "nextjs-portal { display: none !important; }",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (name === "desktop") {
      await expect(
        page.getByRole("complementary", { name: "تصفية المنتجات" }),
      ).toBeVisible();
    } else {
      await page.getByRole("button", { name: "عرض", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "عرض", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "عرض", exact: true }).click();
      await page.getByRole("dialog").getByLabel("العروض والخصومات فقط").check();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "عرض النتائج" })
        .click();
      await expect(page).toHaveURL(/on_sale=true/);
      await expect(page.getByTestId("product-grid")).toBeVisible();
    }
  });
}

test("SSR, pagination, search, empty reset, and persistent wishlist", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/category/electronics?sort=price_asc");
  const firstGrid = page.getByTestId("product-grid");
  const firstHref = await firstGrid
    .locator("h3 a")
    .first()
    .getAttribute("href");
  const heart = firstGrid
    .getByRole("button", { name: "أضف إلى المفضلة" })
    .first();
  await heart.click();
  await expect(
    firstGrid.getByRole("button", { name: "إزالة من المفضلة" }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page
      .getByTestId("product-grid")
      .getByRole("button", { name: "إزالة من المفضلة" })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "التالي", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/sort=price_asc/);
  expect(
    await page
      .getByTestId("product-grid")
      .locator("h3 a")
      .first()
      .getAttribute("href"),
  ).not.toBe(firstHref);
  await page.goto("/search?q=impossible-result-zz");
  await expect(page.getByText("لم نعثر على نتائج")).toBeVisible();
  await page
    .getByRole("link", { name: "إعادة ضبط الفلاتر", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("product-grid")).toBeVisible();
  await page.goto("/en/categories");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const search = page.getByRole("search").filter({ visible: true });
  await search.locator('input[name="q"]').fill("headphones");
  await search.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/en\/search\?q=headphones/);
  await expect(
    page.getByRole("heading", { name: "Results for “headphones”" }),
  ).toBeVisible();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const ssr = await context.newPage();
  await ssr.goto(`${baseURL}/category/electronics?on_sale=true`);
  // Streaming Suspense markup is in the server response before hydration.
  await expect(ssr.getByTestId("product-grid")).toBeAttached();
  await expect(
    ssr.getByTestId("product-grid").getByText(/-\d+%/).first(),
  ).toBeAttached();
  await context.close();
});

test("subcategories, rating and prices filter the SSR result", async ({
  page,
}) => {
  await page.goto(
    "/category/electronics?min_rating=4.5&min_price=50&max_price=200&on_sale=true",
  );
  const cards = page.getByTestId("product-grid").locator(":scope > li");
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(
    page.getByRole("complementary").getByLabel("السعر من"),
  ).toHaveValue("50");
  await expect(
    page.getByRole("complementary").getByLabel("السعر إلى"),
  ).toHaveValue("200");
  await page
    .getByRole("complementary")
    .getByLabel("القسم الفرعي")
    .selectOption("c1-phones");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "عرض النتائج" })
    .click();
  await expect(page).toHaveURL(/category_id=/);
  await expect(page).toHaveURL(/min_rating=4.5/);
  await page.goto("/category/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "هذا القسم غير موجود" }),
  ).toBeVisible();
});

test("narrow mobile pages and filter sheet do not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of [
    "/categories",
    "/category/electronics",
    "/search?q=headphones",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "عرض", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("link", { name: "إعادة ضبط الفلاتر" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "إغلاق الفلاتر" }),
  ).toBeFocused();
});
