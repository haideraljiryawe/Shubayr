import { expect, test, type Page } from "@playwright/test";
import { bannerFromApi } from "../../src/lib/banners";

/**
 * Home banners on the production build (NOTE-001, contract 17.7.0), with the
 * mocked feed: slide 1 opens the offers with a button label, slide 2 a
 * category with 2:1 artwork but no label, slide 3 has no action, slide 4 is
 * image-only with an external link.
 *
 * - No action: nothing in the slide is a link, no button.
 * - An action without a label makes the whole card the link; no invented text.
 * - The artwork shows on phones too, at 2:1, and is never stretched.
 */

const slides = (page: Page) => page.getByTestId("hero-banner");

test("the API mapping invents no link and no button text", () => {
  const base = {
    id: "b",
    title: "عروض",
    subtitle: null,
    image_url: "https://api.example.test/api/v1/media/m",
    internal_name: "Banner fixture",
    title_ar: "عروض",
    title_en: "Offers",
    subtitle_ar: null,
    subtitle_en: null,
    cta_label_ar: null,
    cta_label_en: null,
    show_text: true,
    action_type: "none" as const,
    action_target_id: null,
    action: { type: "none" as const, url: null, target: null },
    is_default: false,
    default_priority: 0,
    sort_order: 0,
    is_active: true,
    effective_status: "active" as const,
    starts_at: null,
    ends_at: null,
    created_at: "2026-10-18T00:00:00Z",
  };
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null }, 0)).toMatchObject({ target: { kind: "none" }, cta_ar: null, cta_en: null });
  expect(bannerFromApi({ ...base, cta_text: "  ", link_url: "" }, 0)).toMatchObject({ target: { kind: "none" }, cta_ar: null, cta_en: null });
  // A legacy link is the url action; another site opens as an external target.
  const legacy = { ...base, cta_text: "تسوق", link_url: "https://partner.example/offers", action_type: "url" as const, action: { type: "url" as const, url: "https://partner.example/offers", target: null } };
  expect(bannerFromApi(legacy, 0)).toMatchObject({
    target: { kind: "external", url: "https://partner.example/offers" },
    cta_ar: "تسوق",
    cta_en: "تسوق",
  });
  // A link back into the store stays inside it, without its language prefix.
  expect(bannerFromApi({ ...legacy, link_url: null, action: { ...legacy.action, url: "https://shubayr.com/en/search?on_sale=true" } }, 0, "https://shubayr.com")).toMatchObject({
    target: { kind: "internal", path: "/search?on_sale=true" },
  });
  // Structured actions: product / category / offers, and an unavailable target stays inert.
  const target = (available: boolean, slug: string | null = null) => ({ id: "11111111-1111-4111-8111-111111111111", slug, name_ar: "ن", name_en: "N", available });
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null, action_type: "product", action: { type: "product", url: null, target: target(true) } }, 0).target).toEqual({ kind: "internal", path: "/product/11111111-1111-4111-8111-111111111111" });
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null, action_type: "category", action: { type: "category", url: null, target: target(true, "kitchen") } }, 0).target).toEqual({ kind: "internal", path: "/category/kitchen" });
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null, action_type: "offers", action: { type: "offers", url: null, target: null } }, 0).target).toEqual({ kind: "internal", path: "/search?on_sale=true" });
  expect(bannerFromApi({ ...base, cta_text: null, link_url: null, action_type: "product", action: { type: "product", url: null, target: target(false) } }, 0).target).toEqual({ kind: "none" });
  // A javascript: or other non-web address is never followed.
  expect(bannerFromApi({ ...base, cta_text: null, link_url: "javascript:alert(1)", action_type: "url", action: { type: "url", url: "javascript:alert(1)", target: null } }, 0).target).toEqual({ kind: "none" });
  // Text falls back to the other language, then the legacy field; show_text is kept.
  expect(bannerFromApi({ ...base, title_ar: "", title_en: "Offers", cta_text: null, link_url: null, show_text: false }, 0)).toMatchObject({ title_ar: "Offers", show_text: false });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("each slide does only what its data says", async ({ page }) => {
    await page.goto("/");
    await expect(slides(page)).toHaveCount(4);

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
