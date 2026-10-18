import { expect, test } from "./fixtures";
import { API, requireLiveApi, uiLoginAsAdmin } from "./helpers";

/**
 * Settings → Store info (contract 17.2) against a real API: the owner fills
 * in the legal, contact and policy details the store shows publicly. Mistakes
 * are refused next to their field before anything is sent; a local phone
 * number is saved in E.164; the public GET /settings returns what was saved;
 * an emptied field is cleared to null (the store then hides it).
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const local = `0770${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const e164 = `+964${local.slice(1)}`;

test("the owner edits the store info; the public settings follow", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/settings");
  await page.getByTestId("settings-tab-storeInfo").click();
  await expect(page).toHaveURL(/\/settings\/store-info$/);
  const form = page.getByTestId("store-info-form");
  await expect(form).toBeVisible();

  const field = (key: string) => form.getByTestId(`store-info-${key}`);
  await field("store_legal_name_ar").fill(`شركة شبير ${run}`);
  await field("store_legal_name_en").fill(`Shubayr Trading ${run}`);
  await field("store_address_ar").fill("شارع المتنبي، بغداد");
  await field("support_phone").fill(`${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`);
  await field("support_email").fill("not-an-email");
  await field("privacy_email").fill(`privacy-${run}@shubayr.test`);
  await field("support_hours_ar").fill(`السبت إلى الخميس ${run}`);
  await field("refund_days").fill("٥");
  await field("policy_effective_date").fill("2026-10-01");

  // Refused next to their fields, before anything is sent.
  const window = await field("return_window_days").inputValue();
  await field("return_window_days").fill("");
  let requests = 0;
  page.on("request", (sent) => {
    if (sent.method() === "PUT" && sent.url().includes("/api/proxy/admin/settings")) requests += 1;
  });
  await form.getByTestId("store-info-save").click();
  await expect(form).toContainText("أدخل بريدًا إلكترونيًا صحيحًا");
  await expect(form).toContainText("هذا الحقل مطلوب");
  expect(requests).toBe(0);

  await field("support_email").fill(`help-${run}@shubayr.test`);
  await field("return_window_days").fill(window);
  const [saved] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/api/proxy/admin/settings")),
    form.getByTestId("store-info-save").click(),
  ]);
  expect(saved.status()).toBe(200);
  await expect(page.getByText("حُفظت معلومات المتجر")).toBeVisible();

  // Stored as the API keeps it: the phone in E.164, Latin digits.
  await page.reload();
  await expect(field("support_phone")).toHaveValue(e164);
  await expect(field("refund_days")).toHaveValue("5");
  let settings = await (await request.get(`${API}/settings`)).json();
  expect(settings).toMatchObject({
    store_legal_name_ar: `شركة شبير ${run}`,
    store_legal_name_en: `Shubayr Trading ${run}`,
    store_address_ar: "شارع المتنبي، بغداد",
    support_phone: e164,
    support_email: `help-${run}@shubayr.test`,
    privacy_email: `privacy-${run}@shubayr.test`,
    support_hours_ar: `السبت إلى الخميس ${run}`,
    refund_days: 5,
    policy_effective_date: "2026-10-01",
    return_window_days: Number(window),
  });

  // Emptying a field clears it: the store hides that line.
  await field("privacy_email").fill("");
  await form.getByTestId("store-info-save").click();
  await expect(page.getByText("حُفظت معلومات المتجر").first()).toBeVisible();
  await expect(async () => {
    settings = await (await request.get(`${API}/settings`)).json();
    expect(settings.privacy_email).toBeNull();
  }).toPass({ timeout: 10_000 });
  expect(settings.support_email).toBe(`help-${run}@shubayr.test`);

  // Saving again with nothing changed sends nothing.
  await form.getByTestId("store-info-save").click();
  await expect(form.getByTestId("store-info-unchanged")).toBeVisible();
});
