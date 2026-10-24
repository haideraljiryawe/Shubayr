import { expect, type Locator, type Page } from "@playwright/test";

/* ---------------------------------------------------------------------------
 * Driving the signed-in shell (VIS-002, VIS-004) from the live suite: the
 * sidebar groups its pages (a collapsed group keeps its links in the page,
 * hidden), the language lives in the account menu, and signing out asks
 * first.
 * ------------------------------------------------------------------------- */

/**
 * A sidebar link, its group opened if it is collapsed. Use it to click or
 * check a page's link; `toHaveCount` on `nav-<key>` still works without it.
 */
export async function navLink(page: Page, key: string): Promise<Locator> {
  const nav = page.getByTestId("sidebar-nav");
  const link = nav.getByTestId(`nav-${key}`);
  await expect(link).toHaveCount(1);
  if (!(await link.isVisible())) {
    const group = nav.locator("[data-nav-group]").filter({ has: link });
    await group.locator('button[aria-expanded="false"]').click();
  }
  await expect(link).toBeVisible();
  return link;
}

/** Switch AR ⇄ EN: the light control before sign-in, the account menu after. */
export async function toggleLocale(page: Page): Promise<void> {
  const html = page.locator("html");
  const next = (await html.getAttribute("lang")) === "ar" ? "en" : "ar";
  const signedOut = page.getByTestId("locale-switch");
  if (await signedOut.isVisible()) await signedOut.click();
  else {
    await page.getByTestId("account-menu").click();
    await page.getByTestId(`account-locale-${next}`).click();
  }
  await expect(html).toHaveAttribute("lang", next);
}

/** Sign out through the account menu and its confirmation. */
export async function signOut(page: Page): Promise<void> {
  await page.getByTestId("account-menu").click();
  await page.getByTestId("sign-out").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("confirm-submit").click();
}

/**
 * Wait until React owns an element: a click on a server-rendered button
 * before hydration does nothing (or submits the form natively).
 */
export async function hydrated(page: Page, testId: string): Promise<void> {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}
