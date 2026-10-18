import { expect, test, type Page } from "@playwright/test";
import { bannerFromApi } from "../../src/lib/banners";

/**
 * Home banners on the production build (NOTE-001), with the mocked feed:
 * slide 1 has a link and a button label, slide 2 a link and 2:1 artwork but no
 * label, slide 3 neither link nor label.
 *
 * - No link means no action: nothing in the slide is a link, no button.
 * - A link without a label makes the whole card the link; no invented text.
 * - The artwork shows on phones too, at 2:1, and is never stretched.
 */

const slides = (page: Page) => page.getByTestId("hero-banner");

test("the API mapping invents no link and no button text", () => {
  const base = {
    id: "b",
    title: "عروض",
    subtitle: null,
    image_url: "https://api.example.test/api/v1/media/m",
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: "2026-10-18T00:00:00Z",
  };
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null }, 0)).toMatchObject({ href: null, cta_ar: null, cta_en: null });
  expect(bannerFromApi({ ...base, cta_text: "  ", link_url: "" }, 0)).toMatchObject({ href: null, cta_ar: null, cta_en: null });
  expect(bannerFromApi({ ...base, cta_text: "تسوق", link_url: "https://shubayr.com/offers" }, 0)).toMatchObject({
    href: "https://shubayr.com/offers",
    cta_ar: "تسوق",
    cta_en: "تسوق",
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("each slide does only what its data says", async ({ page }) => {
    await page.goto("/");
    await expect(slides(page)).toHaveCount(3);

    const withButton = slides(page).nth(0);
    await expect(withButton).toHaveAttribute("data-action", "button");
    await expect(withButton.getByTestId("hero-cta")).toHaveText("تسوق الآن");

    const wholeCard = slides(page).nth(1);
    await expect(wholeCard).toHaveAttribute("data-action", "card");
    await expect(wholeCard.getByTestId("hero-cta")).toHaveCount(0);
    await expect(wholeCard.getByTestId("hero-card-link")).toHaveAttribute("href", /\/category\/electronics/);
    await expect(wholeCard.getByTestId("hero-card-link")).toHaveAttribute("aria-label", "وصل حديثًا");

    const noAction = slides(page).nth(2);
    await expect(noAction).toHaveAttribute("data-action", "none");
    await expect(noAction.locator("a")).toHaveCount(0);
    await expect(noAction.getByTestId("hero-cta")).toHaveCount(0);
    await expect(noAction).not.toContainText("تسوق");
    await expect(noAction).not.toContainText("/categories");
  });

  test("beside the text the artwork is whole: 2:1, contained", async ({ page }) => {
    await page.goto("/");
    const art = slides(page).nth(1).getByTestId("hero-art");
    await expect(art).toBeVisible();
    const box = await art.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(2, 1);
    expect(await art.locator("img").evaluate((img) => getComputedStyle(img).objectFit)).toBe("contain");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });

  test("the artwork shows on a phone, across the card at 2:1, not stretched", async ({ page }) => {
    await page.goto("/");
    const slide = slides(page).nth(1);
    const art = slide.getByTestId("hero-art");
    await expect(art).toBeVisible();
    const box = await art.boundingBox();
    const card = await slide.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(2, 1);
    // Spans the card's content width (16 px padding on each side).
    expect(box!.width).toBeGreaterThan(card!.width - 40);
    const img = art.locator("img");
    expect(await img.evaluate((node) => getComputedStyle(node).objectFit)).toBe("cover");
    // The picture is laid out at its own 2:1 (1600 × 800), so cover crops nothing.
    // The second slide starts off-screen and loads lazily: bring it in first.
    await art.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((node: HTMLImageElement) => (node.complete && node.naturalHeight ? node.naturalWidth / node.naturalHeight : 0)))
      .toBeCloseTo(2, 2);
    // No page-wide sideways scrolling at phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test("a slide without artwork has no empty picture box on a phone", async ({ page }) => {
    await page.goto("/");
    await expect(slides(page).nth(2).getByTestId("hero-art")).toHaveCount(0);
  });
});
