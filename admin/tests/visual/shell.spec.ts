import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { uiLoginAsAdmin } from "../live/helpers";

/**
 * The shell, home and sign-in (PR A14: VIS-001/002/003/004/025), photographed
 * in Arabic and English at a wide and a narrow width — each shot preceded by
 * the rule it shows. Writes
 * docs/reviews/web-admin-2026-10-22/a14-evidence/<name>.<locale>.<width>.png.
 * See playwright.visual.config.ts.
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-admin-2026-10-22", "a14-evidence");
const LOCALES = ["ar", "en"] as const;
const WIDTHS = [
  { name: "wide", width: 1440, height: 900 },
  { name: "narrow", width: 390, height: 844 },
] as const;

async function useLocale(page: Page, locale: string) {
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3300");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, domain: url.hostname, path: "/" }]);
}

async function settle(locator: Locator) {
  await locator.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
}

async function shot(target: Page | Locator, name: string) {
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  await page.addStyleTag({ content: "nextjs-portal, [data-testid='toast'] { display: none !important; }" });
  const path = join(OUT, `${name}.png`);
  if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide" });
  else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page-wide horizontal overflow").toBeLessThanOrEqual(1);
}

async function hydrated(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const locale of LOCALES) {
  for (const size of WIDTHS) {
    const tag = `${locale}.${size.name}`;
    const wide = size.name === "wide";

    test(`shell ${tag}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await useLocale(page, locale);

      // VIS-001 / VIS-025: the name once, the heading and its line, the
      // light language control, the version at the bottom.
      await page.goto("/login");
      await expect(page.getByTestId("auth-brand")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "ar" ? "تسجيل الدخول" : "Sign in");
      await expect(page.getByTestId("app-version")).toBeVisible();
      await expectNoPageOverflow(page);
      await shot(page, `login.${tag}`);
      // The empty-field messages.
      await hydrated(page, "login-submit");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("error-username")).toHaveText(locale === "ar" ? "أدخل اسم المستخدم." : "Enter your username.");
      await expect(page.getByTestId("error-password")).toHaveText(locale === "ar" ? "أدخل كلمة المرور." : "Enter your password.");
      await shot(page, `login-empty.${tag}`);

      // VIS-003: the focused home.
      await uiLoginAsAdmin(page);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.getByTestId("owner-dashboard-summary")).toBeVisible();
      await expect(page.getByTestId("performance")).toBeVisible();
      const shortcuts = page.getByTestId("shortcuts").locator('[data-testid^="shortcut-"]');
      expect(await shortcuts.count()).toBeGreaterThanOrEqual(4);
      expect(await shortcuts.count()).toBeLessThanOrEqual(6);
      await expectNoPageOverflow(page);
      await shot(page, `home.${tag}`);
      await shot(page.locator("main"), `home-content.${tag}`);

      // VIS-004: the top bar stays put while the page scrolls.
      await page.goto("/inventory/movements");
      await page.mouse.wheel(0, 1500);
      await page.waitForFunction(() => window.scrollY > 0).catch(() => {});
      expect((await page.getByTestId("top-bar").boundingBox())?.y).toBe(0);

      if (wide) {
        // VIS-002: the groups, the current page's group open, the logo fixed
        // above the menu, which scrolls inside itself.
        await page.goto("/inventory/warehouses");
        const sidebar = page.getByTestId("sidebar");
        await expect(sidebar.getByTestId("nav-group-inventory")).toHaveAttribute("aria-expanded", "true");
        await sidebar.getByTestId("nav-group-finance").click();
        await sidebar.getByTestId("nav-group-catalog").click();
        const brand = (await sidebar.getByTestId("shell-brand").boundingBox())!;
        const scroller = sidebar.locator("[data-nav-scroller]");
        await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
        expect((await sidebar.getByTestId("shell-brand").boundingBox())?.y).toBe(brand.y);
        await expect(sidebar.getByTestId("sidebar-footer")).toBeInViewport();
        await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
        await shot(sidebar, `sidebar.${tag}`);
        await sidebar.getByTestId("nav-group-finance").click();
        await sidebar.getByTestId("nav-group-catalog").click();
      } else {
        // VIS-002: the drawer from the reading side over a dimmed page.
        await page.goto("/inventory/warehouses");
        await hydrated(page, "drawer-open");
        await page.getByTestId("drawer-open").click();
        const drawer = page.getByTestId("nav-drawer");
        await expect(drawer).toBeVisible();
        await settle(drawer);
        const box = (await drawer.boundingBox())!;
        if (locale === "ar") expect(Math.round(box.x + box.width)).toBe(size.width);
        else expect(Math.round(box.x)).toBe(0);
        expect(box.width).toBeLessThanOrEqual(size.width * 0.85);
        await shot(page, `drawer.${tag}`);
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
      }

      // VIS-004: the account menu, then the sign-out question.
      await page.goto("/");
      await hydrated(page, "account-menu");
      await page.getByTestId("account-menu").click();
      const menu = page.getByTestId("account-menu-content");
      await expect(menu.getByTestId("account-change-password")).toBeVisible();
      await settle(menu);
      await shot(page, `account-menu.${tag}`);
      await menu.getByTestId("sign-out").click();
      const dialog = page.getByTestId("confirm-dialog");
      await expect(dialog).toBeVisible();
      await settle(dialog);
      await shot(page, `sign-out.${tag}`);
      await dialog.getByTestId("confirm-cancel").click();
      await expect(dialog).toBeHidden();
    });
  }
}
