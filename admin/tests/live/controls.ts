import { expect, type Locator } from "@playwright/test";

/* ---------------------------------------------------------------------------
 * Driving the admin's shared controls from the live suite. The Select is a
 * Radix listbox (VIS-005), not a native <select>, so Playwright's
 * selectOption/inputValue do not apply: the trigger carries the current value
 * in `data-value`, and each option its value in `data-value`.
 * ------------------------------------------------------------------------- */

export type OptionPick = string | { label: string } | { index: number };

function listbox(select: Locator): Locator {
  return select.page().getByRole("listbox");
}

async function open(select: Locator): Promise<Locator> {
  await expect(select).toBeEnabled();
  await select.click();
  const box = listbox(select);
  await expect(box).toBeVisible();
  return box;
}

async function close(select: Locator): Promise<void> {
  await select.page().keyboard.press("Escape");
  await expect(listbox(select)).toBeHidden();
}

/** Pick an option by value, by its exact label, or by position. */
export async function choose(select: Locator, pick: OptionPick): Promise<void> {
  const box = await open(select);
  const option =
    typeof pick === "string"
      ? box.locator(`[role="option"][data-value="${pick.replace(/"/g, '\\"')}"]`)
      : "label" in pick
        ? box.getByRole("option", { name: pick.label, exact: true })
        : box.getByRole("option").nth(pick.index);
  await option.click();
  await expect(box).toBeHidden();
}

/** The value currently selected ("" when none). */
export async function selectedValue(select: Locator): Promise<string> {
  return (await select.getAttribute("data-value")) ?? "";
}

/** Every option's label, in order. */
export async function optionTexts(select: Locator): Promise<string[]> {
  const box = await open(select);
  const texts = await box.getByRole("option").allTextContents();
  await close(select);
  return texts.map((text) => text.trim());
}

/** How many options match a value or a piece of label text. */
export async function optionCount(select: Locator, match: { value: string } | { hasText: string }): Promise<number> {
  const box = await open(select);
  const options =
    "value" in match
      ? box.locator(`[role="option"][data-value="${match.value}"]`)
      : box.getByRole("option").filter({ hasText: match.hasText });
  const count = await options.count();
  await close(select);
  return count;
}

/** How a grouped amount field shows a raw number: "90000" → "90,000" (VIS-007). */
export function grouped(value: number | string): string {
  const [whole, fraction] = String(value).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = whole.replace(/^-/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? `${sign}${digits}` : `${sign}${digits}.${fraction}`;
}
