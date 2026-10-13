import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  API,
  activateStaff,
  adminApiToken,
  bearer,
  createStaff,
  placeOrder,
  requireLiveApi,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";

/**
 * Delivery pricing in the Web Admin (API 15.0), in a real browser against a
 * real API: delivery zones and the one-zone-per-governorate rule, the
 * governorates themselves, automatic discount tiers, and the delivery fee
 * changed while confirming an order — up, down, and not at all without the
 * permission.
 *
 * The seed puts every governorate in one development zone. These tests borrow
 * Halabja (released from that zone, put back afterwards) and use discount
 * thresholds far above any order the other specs place, so nothing they
 * create changes another spec's prices; whatever they create is removed in
 * afterAll even when a test fails.
 */

test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface Zone {
  id: string;
  name_ar: string;
  name_en: string;
  fee_iqd: number;
  is_active: boolean;
  governorates: Array<{ id: string; code: string }>;
}
interface Governorate {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  delivery_zone: { id: string } | null;
}

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

const cleanup: { zones: string[]; tiers: string[]; halabjaHome: string | null; halabjaName: string | null } = {
  zones: [],
  tiers: [],
  halabjaHome: null,
  halabjaName: null,
};

async function governorates(request: APIRequestContext): Promise<Governorate[]> {
  return (await api(request, "GET", "/admin/governorates")).body as Governorate[];
}

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test.afterAll(async ({ request }) => {
  for (const id of cleanup.tiers) await api(request, "DELETE", `/admin/discount-tiers/${id}`);
  for (const id of cleanup.zones) await api(request, "DELETE", `/admin/delivery-zones/${id}`);
  const halabja = (await governorates(request)).find((row) => row.code === "halabja");
  if (halabja && cleanup.halabjaName) {
    await api(request, "PATCH", `/admin/governorates/${halabja.id}`, { name_en: cleanup.halabjaName });
  }
  if (halabja && cleanup.halabjaHome && !halabja.delivery_zone) {
    const home = (await api(request, "GET", "/admin/delivery-zones")).body.find((zone: Zone) => zone.id === cleanup.halabjaHome) as Zone | undefined;
    if (home) {
      await api(request, "PATCH", `/admin/delivery-zones/${home.id}`, {
        governorate_ids: [...home.governorates.map((row) => row.id), halabja.id],
      });
    }
  }
});

/** Release Halabja from the zone serving it, remembering that zone. */
async function releaseHalabja(request: APIRequestContext): Promise<Governorate> {
  const halabja = (await governorates(request)).find((row) => row.code === "halabja")!;
  if (halabja.delivery_zone) {
    const zones = (await api(request, "GET", "/admin/delivery-zones")).body as Zone[];
    const home = zones.find((zone) => zone.id === halabja.delivery_zone!.id)!;
    cleanup.halabjaHome = home.id;
    const released = await api(request, "PATCH", `/admin/delivery-zones/${home.id}`, {
      governorate_ids: home.governorates.filter((row) => row.id !== halabja.id).map((row) => row.id),
    });
    expect(released.status, JSON.stringify(released.body)).toBe(200);
  }
  return halabja;
}

function zoneCard(page: Page, nameEn: string) {
  return page.locator(`[data-testid="zone-card"][data-zone="${nameEn}"]`);
}

/* ------------------------------------------------------------ zones */

test("delivery zones: create, the one-zone conflict, edit, deactivate, delete", async ({ page, request }) => {
  const halabja = await releaseHalabja(request);
  await uiLoginAsAdmin(page);
  await page.goto("/settings/delivery-zones");

  // Halabja has no zone now: the warning names it.
  const unserved = page.getByTestId("unserved-governorates");
  await expect(unserved.locator('[data-testid="unserved-governorate"][data-code="halabja"]')).toBeVisible();

  // A new zone with Halabja — and Baghdad, which the development zone holds.
  await page.getByTestId("zone-new").click();
  const form = page.getByTestId("zone-form");
  await form.getByTestId("zone-name-ar").fill(`منطقة ${run}`);
  await form.getByTestId("zone-name-en").fill(`Zone ${run}`);
  await form.getByTestId("zone-fee-input").fill("7000");
  await form.locator('[data-testid="zone-governorate-option"][data-code="halabja"]').check();
  const baghdad = form.locator('[data-testid="zone-governorate-option"][data-code="baghdad"]');
  await expect(baghdad.locator("xpath=ancestor::label")).toContainText("في منطقة:");
  await baghdad.check();
  // Flagged before saving, with the zone that holds it…
  const conflict = form.getByTestId("zone-conflict");
  await expect(conflict).toContainText("بعض المحافظات المختارة تتبع منطقة أخرى");
  await expect(conflict).toContainText("بغداد");
  // …and refused by the API, said in words.
  await form.getByTestId("dialog-submit").click();
  await expect(conflict).toContainText("لم تُحفظ المنطقة: المحافظة الواحدة تتبع منطقة واحدة فقط.");
  await expect(form).toBeVisible();

  // Without Baghdad it saves.
  await baghdad.uncheck();
  await expect(conflict).toHaveCount(0);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  const card = zoneCard(page, `Zone ${run}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("zone-governorate")).toHaveText(["حلبجة"]);
  await expect(card.getByTestId("zone-fee")).toHaveText("7,000 IQD");
  await expect(unserved.locator('[data-code="halabja"]')).toHaveCount(0);
  const created = ((await api(request, "GET", "/admin/delivery-zones")).body as Zone[]).find((zone) => zone.name_en === `Zone ${run}`)!;
  cleanup.zones.push(created.id);
  expect(created).toMatchObject({ fee_iqd: 7000, is_active: true });
  expect(created.governorates.map((row) => row.id)).toEqual([halabja.id]);
  expect((await request.get(`${API}/governorates`)).ok()).toBe(true);

  // Edit the fee.
  await card.getByTestId("zone-edit").click();
  await form.getByTestId("zone-fee-input").fill("٨٥٠٠"); // Arabic digits are fine
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  await expect(card.getByTestId("zone-fee")).toHaveText("8,500 IQD");

  // Deactivated, Halabja is unserved again — "zone inactive".
  await card.getByTestId("zone-toggle").click();
  await expect(card.getByTestId("zone-status")).toHaveText("معطّلة");
  await expect(unserved.locator('[data-code="halabja"]')).toContainText("منطقتها معطّلة");
  const publicHalabja = ((await (await request.get(`${API}/governorates`)).json()) as Array<{ code: string; is_served: boolean }>).find(
    (row) => row.code === "halabja",
  );
  expect(publicHalabja?.is_served).toBe(false);
  await card.getByTestId("zone-toggle").click();
  await expect(card.getByTestId("zone-status")).toHaveText("مفعّلة");

  // Deleted, Halabja has no zone.
  await card.getByTestId("zone-delete").click();
  await page.getByTestId("confirm-submit").click();
  await expect(card).toHaveCount(0);
  await expect(unserved.locator('[data-code="halabja"]')).toBeVisible();
  cleanup.zones = cleanup.zones.filter((id) => id !== created.id);
});

/* ------------------------------------------------------------ governorates */

test("governorates: names in both languages", async ({ page, request }) => {
  const halabja = (await governorates(request)).find((row) => row.code === "halabja")!;
  cleanup.halabjaName = halabja.name_en;
  await uiLoginAsAdmin(page);
  await page.goto("/settings/delivery-zones");
  await page.getByTestId("settings-tab-governorates").click();
  const row = page.locator('[data-testid="governorate-row"][data-code="halabja"]');
  await row.getByTestId("governorate-edit").click();
  const form = page.getByTestId("governorate-form");
  await form.getByTestId("governorate-name-en").fill(`Halabja ${run}`);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  await expect(row).toContainText(`Halabja ${run}`);
  expect((await governorates(request)).find((entry) => entry.code === "halabja")?.name_en).toBe(`Halabja ${run}`);
  // Back as it was.
  await row.getByTestId("governorate-edit").click();
  await form.getByTestId("governorate-name-en").fill(halabja.name_en);
  await form.getByTestId("dialog-submit").click();
  await expect(row).toContainText(halabja.name_en);
  cleanup.halabjaName = null;
});

/* ------------------------------------------------------------ discount tiers */

test("discount tiers: the live example, a taken threshold, edit and delete", async ({ page, request }) => {
  // Thresholds no other spec's order comes near.
  const base = 900_000_000 + (Date.now() % 1000) * 1000;
  await uiLoginAsAdmin(page);
  await page.goto("/settings/discounts");
  await expect(page.getByTestId("tiers-stacking-note")).toContainText("لا يُجمع الخصم التلقائي مع القسائم");

  await page.getByTestId("tier-new").click();
  const form = page.getByTestId("tier-form");
  await form.getByTestId("tier-minimum").fill(String(base));
  await form.getByTestId("tier-percent").fill("5");
  // The example as it is typed: 5% of the threshold, in whole IQD.
  await expect(form.getByTestId("tier-form-example")).toContainText(`${(base * 0.05).toLocaleString("en-US")} IQD`);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  const row = page.locator(`[data-testid="tier-row"][data-min="${base}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("tier-example")).toContainText(`${(base * 0.05).toLocaleString("en-US")} IQD`);
  const created = ((await api(request, "GET", "/admin/discount-tiers")).body as Array<{ id: string; min_subtotal: number }>).find(
    (tier) => tier.min_subtotal === base,
  )!;
  cleanup.tiers.push(created.id);

  // The same threshold again is refused next to the field.
  await page.getByTestId("tier-new").click();
  await form.getByTestId("tier-minimum").fill(String(base));
  await form.getByTestId("tier-percent").fill("7.5");
  await form.getByTestId("dialog-submit").click();
  await expect(form.getByTestId("error-min_subtotal_iqd")).toHaveText("يوجد مستوى آخر بالحد الأدنى نفسه.");
  // A higher threshold with a smaller percent is accepted, and flagged.
  await form.getByTestId("tier-minimum").fill(String(base + 1000));
  await form.getByTestId("tier-percent").fill("4");
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  const lower = page.locator(`[data-testid="tier-row"][data-min="${base + 1000}"]`);
  await expect(lower.getByTestId("tier-warning")).toBeVisible();
  const second = ((await api(request, "GET", "/admin/discount-tiers")).body as Array<{ id: string; min_subtotal: number }>).find(
    (tier) => tier.min_subtotal === base + 1000,
  )!;
  cleanup.tiers.push(second.id);

  // Edit it up to 7.25%: the warning goes, the example follows (half away from zero).
  await lower.getByTestId("tier-edit").click();
  await form.getByTestId("tier-percent").fill("7.25");
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  await expect(lower.getByTestId("tier-warning")).toHaveCount(0);
  const expected = Math.round(((base + 1000) * 725) / 10_000);
  await expect(lower.getByTestId("tier-example")).toContainText(`${expected.toLocaleString("en-US")} IQD`);

  // Deactivate, then delete both.
  await lower.getByTestId("tier-toggle").click();
  await expect(lower.getByTestId("tier-status")).toHaveText("معطّل");
  for (const target of [lower, row]) {
    await target.getByTestId("tier-delete").click();
    await page.getByTestId("confirm-submit").click();
    await expect(target).toHaveCount(0);
  }
  cleanup.tiers = [];
});

/* ------------------------------------------------------------ confirmation fee */

/** A fresh pending order, its confirmation dialog open; returns the order as the admin reads it. */
async function openPendingOrder(page: Page, request: APIRequestContext) {
  const placed = await placeOrder(request);
  const order = (await api(request, "GET", `/admin/orders/${placed.id}`)).body as {
    id: string;
    delivery_fee: number;
    total: number;
  };
  await page.goto(`/orders/${order.id}`);
  await page.getByTestId("order-action-accept").click();
  return order;
}

test("confirmation: the fee raised and lowered, with old → new and the new total shown first", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  for (const [newFee, reason] of [
    [9000, `Remote district ${run}`],
    [1000, `Nearby, agreed on the call ${run}`],
  ] as const) {
    const order = await openPendingOrder(page, request);
    const oldFee = Number(order.delivery_fee);
    const total = Number(order.total);
    const dialog = page.getByTestId("confirm-dialog");
    await dialog.getByTestId("customer-contacted").check();
    await dialog.getByTestId("customer-contact-note").fill(`Customer answered ${run}`);
    await dialog.getByTestId("adjusted-delivery-fee").fill(String(newFee));
    const preview = dialog.getByTestId("delivery-fee-preview");
    await expect(preview.getByTestId("delivery-fee-preview-change")).toHaveText(
      `${oldFee.toLocaleString("en-US")} IQD → ${newFee.toLocaleString("en-US")} IQD`,
    );
    const newTotal = total - oldFee + newFee;
    await expect(preview.getByTestId("delivery-fee-preview-total")).toHaveText(`${newTotal.toLocaleString("en-US")} IQD`);
    // A new fee needs its reason: the browser will not submit without it.
    await dialog.getByTestId("confirm-submit").click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("delivery-fee-adjustment-reason").fill(reason);
    await dialog.getByTestId("confirm-submit").click();
    await expect(dialog).toBeHidden();

    const saved = (await api(request, "GET", `/admin/orders/${order.id}`)).body as {
      status: string;
      delivery_fee: number;
      total: number;
      delivery_fee_adjustment: { original_fee: number; adjusted_fee: number; reason: string } | null;
      confirmation_contact: { customer_contacted: boolean; note: string } | null;
    };
    expect(saved).toMatchObject({ status: "confirmed", delivery_fee: newFee, total: newTotal });
    expect(saved.delivery_fee_adjustment).toMatchObject({ original_fee: oldFee, adjusted_fee: newFee, reason });
    expect(saved.confirmation_contact).toMatchObject({ customer_contacted: true, note: `Customer answered ${run}` });
  }
});

test("confirmation without the fee permission: contact required, no fee field", async ({ page, request }) => {
  const clerk = await activateStaff(
    request,
    await createStaff(request, { permissionKeys: ["orders.view", "orders.accept"], prefix: "confirm" }),
  );
  await switchUser(page, clerk.username, clerk.password);
  const order = await openPendingOrder(page, request);
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog.getByTestId("confirmation-contact-fields")).toBeVisible();
  await expect(dialog.getByTestId("adjusted-delivery-fee")).toHaveCount(0);
  // The call must be ticked and noted before it confirms.
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("customer-contacted").check();
  await dialog.getByTestId("customer-contact-note").fill(`Confirmed by phone ${run}`);
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeHidden();
  const saved = (await api(request, "GET", `/admin/orders/${order.id}`)).body as { status: string; delivery_fee: number; delivery_fee_adjustment: unknown };
  expect(saved.status).toBe("confirmed");
  expect(saved.delivery_fee).toBe(Number(order.delivery_fee));
  expect(saved.delivery_fee_adjustment).toBeNull();
});
