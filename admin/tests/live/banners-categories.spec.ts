import { deflateSync } from "node:zlib";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { API, adminApiToken, bearer, requireLiveApi, uiLoginAsAdmin } from "./helpers";

/**
 * PR A9 in a real browser, through the BFF, against a real API:
 * - categories (NOTE-003/006/008): descriptions saved and cleared without
 *   touching other fields, a picture cropped and uploaded, replaced, kept
 *   when a replacement upload fails (and retried), then removed;
 * - home banners (NOTE-001): create → schedule (Baghdad time) → disable →
 *   duplicate → reorder → delete, plus an expired banner reused and a
 *   one-date banner shown as saved.
 * Fixtures carry a per-run suffix and are removed at the end.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const createdBanners: string[] = [];

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

/* ------------------------------------------------------------ pictures */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A solid-colour PNG of the given size. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function pickAndCrop(page: Page, field: string, name: string, picture: Buffer, expectedSize: string) {
  const box = page.getByTestId(field);
  await box.getByTestId(`${field}-input`).setInputFiles({ name, mimeType: "image/png", buffer: picture });
  const frame = box.getByTestId(`${field}-cropper-frame`);
  await expect(frame).toBeVisible();
  // Drag the picture: the crop moves (its size doesn't).
  const before = await frame.getAttribute("data-crop");
  const area = (await frame.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 40, area.y + area.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  const after = await frame.getAttribute("data-crop");
  const [, , beforeWidth] = (before ?? "").split(",");
  const [, , afterWidth] = (after ?? "").split(",");
  expect(afterWidth).toBe(beforeWidth);
  await box.getByTestId(`${field}-use-crop`).click();
  await expect(box.getByTestId(`${field}-pending`)).toContainText(expectedSize);
}

/** "2026-10-19T00:00" in Baghdad, `days` from now. */
function baghdadLocal(days: number): string {
  const at = new Date(Date.now() + days * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/* ------------------------------------------------------------ categories */

test("category: description saved and cleared, picture cropped, replaced, kept on a failed upload, removed", async ({ page, request }) => {
  const slug = `a9-dept-${run}`;
  const created = await api(request, "POST", "/admin/categories", { name_ar: `قسم ${run}`, name_en: `Dept ${run}`, slug, sort_order: 90 });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const id = created.body.id as string;
  const read = async () => (await api(request, "GET", "/admin/categories")).body.find((node: { id: string }) => node.id === id);

  try {
    await uiLoginAsAdmin(page);
    await page.goto("/catalog/categories");
    // Each edit starts from a fresh read of the tree (the list refreshes in the
    // background after a save; a reload makes the next step deterministic).
    const open = async () => {
      await page.goto("/catalog/categories");
      await page.getByTestId(`category-edit-${slug}`).click();
      await expect(page.getByTestId("category-form")).toBeVisible();
      return page.getByTestId("category-form");
    };

    // 1. Descriptions and a first picture, with the soft guidance on a long text.
    let form = await open();
    const longDescription = "كل ما تحتاجه لمطبخك من أدوات وأجهزة كهربائية صغيرة وكبيرة بأسعار مناسبة";
    await form.getByTestId("category-description-ar").fill(longDescription);
    await expect(form.getByTestId("category-description-ar-guide-warning")).toHaveText("قد يُختصر هذا النص بـ … على الشاشات الصغيرة");
    await form.getByTestId("category-description-en").fill("Kitchen tools");
    await expect(form.getByTestId("category-description-en-guide-warning")).toHaveCount(0);
    await expect(form.getByTestId("category-preview-description-ar")).toHaveText(longDescription);
    await pickAndCrop(page, "category-image", "kitchen.png", png(1200, 800, [200, 60, 40]), "800 × 800");
    await expect(form.getByTestId("category-preview-card-en").getByTestId("artwork-image")).toBeVisible();
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    let stored = await read();
    // The full text, not shortened to the guidance.
    expect(stored.description_ar).toBe(longDescription);
    expect(stored.description_en).toBe("Kitchen tools");
    expect(stored.image_url).toMatch(/\/media\//);
    const first = stored.image_url as string;
    await expect(page.getByTestId(`category-thumb-${slug}`)).toHaveAttribute("data-image", first);
    const media = await request.get(first);
    expect(media.status()).toBe(200);
    expect(media.headers()["content-type"]).toMatch(/^image\/(webp|png)/);

    // 2. A replacement whose upload fails keeps the saved picture; saving again works.
    form = await open();
    await pickAndCrop(page, "category-image", "green.png", png(2000, 2000, [40, 160, 60]), "1024 × 1024");
    await page.route("**/api/media/images", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"UNAVAILABLE"}' }));
    await form.getByTestId("dialog-submit").click();
    await expect(form.getByTestId("category-image-upload-failed")).toBeVisible();
    expect((await read()).image_url).toBe(first);
    await page.unroute("**/api/media/images");
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    stored = await read();
    expect(stored.image_url).not.toBe(first);
    expect(stored.description_ar).toBe(longDescription);
    const second = stored.image_url as string;

    // 3. An unrelated edit (the English name) changes nothing else.
    form = await open();
    await form.getByTestId("category-name-en").fill(`Kitchen ${run}`);
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    stored = await read();
    expect(stored.name_en).toBe(`Kitchen ${run}`);
    expect(stored.description_ar).toBe(longDescription);
    expect(stored.description_en).toBe("Kitchen tools");
    expect(stored.image_url).toBe(second);

    // 4. Clearing English: admin reads preserve the missing translation, while
    // the form explains that the public catalog will use its fallback.
    form = await open();
    await form.getByTestId("category-description-en").fill("");
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    stored = await read();
    expect(stored.description_en).toBeNull();
    form = await open();
    await expect(form.getByTestId("category-description-fallback")).toContainText(
      "إذا تُركت لغة فارغة يعرض المتجر وصف اللغة الأخرى مكانه",
    );
    // Clearing Arabic too leaves no description at all.
    await form.getByTestId("category-description-ar").fill("");
    await form.getByTestId("category-description-en").fill("");
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    stored = await read();
    expect(stored.description_ar).toBeNull();
    expect(stored.description_en).toBeNull();

    // 5. Remove the picture: the category stays, the media object isn't deleted.
    form = await open();
    await form.getByTestId("category-image-remove").click();
    await expect(form.getByTestId("category-image-remove-note")).toBeVisible();
    await expect(form.getByTestId("category-preview-tile").getByTestId("artwork-placeholder")).toBeVisible();
    await form.getByTestId("dialog-submit").click();
    await expect(page.getByTestId("category-form")).toBeHidden();
    stored = await read();
    expect(stored.image_url).toBeNull();
    expect(stored.name_ar).toBe(`قسم ${run}`);
    await expect(page.getByTestId(`category-thumb-${slug}`)).toHaveAttribute("data-image", "");
    expect((await request.get(second)).status()).toBe(200);
  } finally {
    await api(request, "DELETE", `/admin/categories/${id}`);
  }
});

/* ------------------------------------------------------------ banners */

async function bannerRow(page: Page, title: string) {
  return page.getByTestId("banner-row").filter({ has: page.getByTestId("banner-row-title").getByText(title, { exact: true }) });
}

async function allBanners(request: APIRequestContext) {
  const page = await api(request, "GET", "/admin/banners?per_page=100");
  return page.body.data as Array<{ id: string; title: string; sort_order: number; is_active: boolean; starts_at: string | null; ends_at: string | null; created_at: string }>;
}

test("banner: create → schedule → disable → duplicate → reorder → delete", async ({ page, request }) => {
  const title = `عروض الموسم ${run}`;
  await uiLoginAsAdmin(page);
  await page.goto("/catalog/banners");

  try {
    // Create: a 2:1 picture, a link with a button label, switched on, permanent.
    await page.getByTestId("banner-new").click();
    const form = page.getByTestId("banner-form");
    await form.getByTestId("dialog-submit").click();
    await expect(form).toContainText("أدخل العنوان.");
    await expect(form.getByTestId("banner-image-required")).toBeVisible();
    await form.getByTestId("banner-title").fill(title);
    await pickAndCrop(page, "banner-image", "season.png", png(2400, 1600, [30, 90, 60]), "1600 × 800");
    await expect(form.getByTestId("banner-preview-phone")).toBeVisible();
    await expect(form.getByTestId("banner-preview-desktop")).toBeVisible();
    await expect(form.getByTestId("banner-preview-action")).toContainText("لا يوجد رابط");
    await expect(form.getByTestId("banner-actions-later")).toContainText("التحديث القادم");
    await form.getByTestId("banner-link").fill("/offers");
    await form.getByTestId("dialog-submit").click();
    await expect(form).toContainText("أدخل عنوان ويب كاملًا");
    await form.getByTestId("banner-link").fill(`https://example.com/offers/${run}`);
    await form.getByTestId("banner-cta").fill("تسوق العروض");
    await expect(form.getByTestId("banner-preview-cta")).toHaveText("تسوق العروض");
    await form.getByTestId("banner-enabled").check();
    await expect(form.getByTestId("banner-outcome")).toHaveAttribute("data-status", "active");
    await form.getByTestId("dialog-submit").click();
    await expect(form).toBeHidden();
    let row = await bannerRow(page, title);
    await expect(row).toHaveAttribute("data-status", "active");
    await expect(row.getByTestId("banner-schedule-text")).toHaveText("دائم");
    await expect(row.getByTestId("banner-link-text")).toContainText(`https://example.com/offers/${run}`);
    let mine = (await allBanners(request)).find((banner) => banner.title === title)!;
    createdBanners.push(mine.id);
    expect(mine.is_active).toBe(true);

    // Schedule it from tomorrow for two days, in Baghdad time.
    const starts = baghdadLocal(1);
    const ends = baghdadLocal(3);
    await row.getByTestId("banner-edit").click();
    await form.getByTestId("banner-mode-scheduled").check();
    await form.getByTestId("banner-starts").fill(starts);
    await form.getByTestId("banner-ends").fill(starts);
    await form.getByTestId("dialog-submit").click();
    await expect(form).toContainText("يجب أن يكون الانتهاء بعد البدء.");
    await form.getByTestId("banner-ends").fill(ends);
    await expect(form.getByTestId("banner-outcome")).toHaveAttribute("data-status", "scheduled");
    await form.getByTestId("dialog-submit").click();
    await expect(form).toBeHidden();
    row = await bannerRow(page, title);
    await expect(row).toHaveAttribute("data-status", "scheduled");
    await expect(row.getByTestId("banner-schedule-text")).toContainText("(بغداد)");
    mine = (await allBanners(request)).find((banner) => banner.id === mine.id)!;
    expect(mine.starts_at).toBe(new Date(`${starts}:00+03:00`).toISOString());
    expect(mine.ends_at).toBe(new Date(`${ends}:00+03:00`).toISOString());

    // Switching to Permanent previews which saved dates would go — then cancel.
    await row.getByTestId("banner-edit").click();
    await form.getByTestId("banner-mode-permanent").check();
    await expect(form.getByTestId("banner-schedule-drops")).toContainText("تاريخ البدء");
    await expect(form.getByTestId("banner-schedule-drops")).toContainText("تاريخ الانتهاء");
    await form.getByRole("button", { name: "إلغاء" }).last().click();
    await expect(form).toBeHidden();

    // Disable: the dates stay.
    await row.getByTestId("banner-toggle").click();
    await expect(row).toHaveAttribute("data-status", "disabled");
    mine = (await allBanners(request)).find((banner) => banner.id === mine.id)!;
    expect(mine.is_active).toBe(false);
    expect(mine.starts_at).not.toBeNull();

    // Duplicate: a disabled copy, last in the list.
    const before = (await allBanners(request)).length;
    await row.getByTestId("banner-duplicate").click();
    await expect(page.getByTestId("banner-row").filter({ hasText: title })).toHaveCount(2);
    const list = await allBanners(request);
    expect(list).toHaveLength(before + 1);
    const copy = list.filter((banner) => banner.title === title && banner.id !== mine.id)[0];
    createdBanners.push(copy.id);
    expect(copy.is_active).toBe(false);
    expect(copy.sort_order).toBe(Math.max(...list.map((banner) => banner.sort_order)));
    const lastRow = page.getByTestId("banner-row").last();
    await expect(lastRow).toHaveAttribute("data-banner-id", copy.id);
    await expect(lastRow.getByTestId("banner-down")).toBeDisabled();

    // Reorder: the copy moves up one place, in the API's order too.
    await lastRow.getByTestId("banner-up").click();
    await expect(page.getByTestId("banner-row").last()).not.toHaveAttribute("data-banner-id", copy.id);
    const rows = page.getByTestId("banner-row");
    const count = await rows.count();
    await expect(rows.nth(count - 2)).toHaveAttribute("data-banner-id", copy.id);
    const ordered = (await allBanners(request)).map((banner) => banner.id);
    expect(ordered.indexOf(copy.id)).toBe(ordered.length - 2);

    // Delete the copy: its own confirmation, then gone.
    await rows.nth(count - 2).getByTestId("banner-delete").click();
    const confirm = page.getByTestId("confirm-dialog");
    await expect(confirm).toContainText("لا يمكن التراجع عنه");
    await confirm.getByTestId("confirm-submit").click();
    await expect(page.locator(`[data-banner-id="${copy.id}"]`)).toHaveCount(0);
    expect((await api(request, "GET", `/admin/banners/${copy.id}`)).status).toBe(404);

    // The status filter finds the disabled original.
    await page.getByTestId("banner-filter").selectOption("disabled");
    await expect(page.locator(`[data-banner-id="${mine.id}"]`)).toBeVisible();
    await page.getByTestId("banner-filter").selectOption("active");
    await expect(page.locator(`[data-banner-id="${mine.id}"]`)).toHaveCount(0);
  } finally {
    for (const id of createdBanners.splice(0)) await api(request, "DELETE", `/admin/banners/${id}`);
  }
});

test("an expired banner stays editable and is reused; a one-date banner is shown as saved", async ({ page, request }) => {
  const upload = await request.post(`${API}/media/images`, {
    headers: bearer(await adminApiToken(request)),
    multipart: { file: { name: "old.png", mimeType: "image/png", buffer: png(1600, 800, [120, 40, 160]) } },
  });
  expect(upload.status()).toBe(201);
  const imageUrl = (await upload.json()).public_url as string;
  const expiredTitle = `حملة منتهية ${run}`;
  const startOnlyTitle = `حملة قادمة ${run}`;
  const expired = await api(request, "POST", "/admin/banners", {
    title: expiredTitle,
    image_url: imageUrl,
    is_active: true,
    sort_order: 900,
    starts_at: "2026-01-01T00:00:00.000Z",
    ends_at: "2026-01-31T21:00:00.000Z",
  });
  const startOnly = await api(request, "POST", "/admin/banners", {
    title: startOnlyTitle,
    image_url: imageUrl,
    is_active: true,
    sort_order: 901,
    starts_at: "2030-01-01T09:00:00.000Z",
  });
  expect(expired.status).toBe(201);
  expect(startOnly.status).toBe(201);
  createdBanners.push(expired.body.id, startOnly.body.id);

  try {
    await uiLoginAsAdmin(page);
    await page.goto("/catalog/banners");
    const form = page.getByTestId("banner-form");

    // One date only: shown honestly and kept as it is.
    const upcoming = await bannerRow(page, startOnlyTitle);
    await expect(upcoming).toHaveAttribute("data-status", "scheduled");
    await expect(upcoming.getByTestId("banner-schedule-text")).toContainText("دون تاريخ انتهاء");
    await upcoming.getByTestId("banner-edit").click();
    await expect(form.getByTestId("banner-mode-startOnly")).toBeChecked();
    await expect(form.getByTestId("banner-mode-partial")).toBeVisible();
    await form.getByTestId("dialog-submit").click();
    await expect(form.getByTestId("banner-no-changes")).toBeVisible();
    await form.getByRole("button", { name: "إلغاء" }).last().click();

    // Enabled but past its end: Expired, never Active — and reusable as Permanent.
    const old = await bannerRow(page, expiredTitle);
    await expect(old).toHaveAttribute("data-status", "expired");
    await old.getByTestId("banner-edit").click();
    await form.getByTestId("banner-mode-permanent").check();
    await expect(form.getByTestId("banner-schedule-drops")).toContainText("تاريخ الانتهاء");
    await expect(form.getByTestId("banner-outcome")).toHaveAttribute("data-status", "active");
    await form.getByTestId("dialog-submit").click();
    await expect(form).toBeHidden();
    await expect(await bannerRow(page, expiredTitle)).toHaveAttribute("data-status", "active");
    const reused = await api(request, "GET", `/admin/banners/${expired.body.id}`);
    expect(reused.body).toMatchObject({ starts_at: null, ends_at: null, is_active: true, image_url: imageUrl });
  } finally {
    for (const id of createdBanners.splice(0)) await api(request, "DELETE", `/admin/banners/${id}`);
  }
});
