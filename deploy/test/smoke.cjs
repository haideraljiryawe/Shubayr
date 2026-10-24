// End-to-end check of a production stack (deploy/docker-compose.local-test.yml,
// or CI): HTTPS and headers, the owner's first sign-in with the forced password
// change, a category and a published product with a picture uploaded through
// the Web Admin, and the store — closed to the public, open to the preview link.
//
//   node deploy/test/smoke.cjs <playwright-module-dir> <domain> <owner> <one-time-password> \
//        <new-password> <preview-token> <screenshot-dir>
//
// Every request goes through the browser (Chromium resolves *.localhost itself).
const [, , pwDir, domain, owner, tempPassword, newPassword, previewToken, outDir] = process.argv;
const { chromium } = require(pwDir);
const { deflateSync } = require("node:zlib");
const path = require("node:path");

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t, "ascii"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([l, body, c]); };
function png(w, h, [r, g, b]) {
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  const rows = []; for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { const inside = x > w * 0.3 && x < w * 0.7 && y > h * 0.15 && y < h * 0.85; row[1 + x * 3] = inside ? 40 : r; row[2 + x * 3] = inside ? 44 : g; row[3 + x * 3] = inside ? 52 : b; } rows.push(row); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
const hydrated = (page, id) => page.waitForFunction((tid) => { const el = document.querySelector(`[data-testid="${tid}"]`); return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps")); }, id, { timeout: 60_000 });
const step = (msg) => console.log(`--> ${msg}`);
const check = (ok, msg) => { if (!ok) throw new Error(`CHECK FAILED: ${msg}`); console.log(`    ok: ${msg}`); };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: "ar", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const admin = `https://admin.${domain}`;
  const store = `https://${domain}`;
  const api = `https://api.${domain}/api/v1`;
  const run = Date.now().toString(36);

  // One navigation in its own tab: status, headers, body, where it ended up.
  async function visit(url) {
    const tab = await context.newPage();
    try {
      const response = await tab.goto(url);
      const first = response.request().redirectedFrom();
      return {
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
        url: tab.url(),
        redirect: first ? (await first.response())?.status() : null,
      };
    } finally {
      await tab.close();
    }
  }

  step("HTTPS, redirects and headers");
  const plain = await visit(`http://admin.${domain}/login`);
  check(plain.redirect === 308 && plain.url.startsWith("https://"), `http:// redirects to https:// (${plain.redirect} → ${plain.url})`);
  const login = await visit(`${admin}/login`);
  check(/noindex/.test(login.headers["x-robots-tag"] ?? ""), `admin X-Robots-Tag: ${login.headers["x-robots-tag"]}`);
  check(/max-age=63072000/.test(login.headers["strict-transport-security"] ?? ""), "HSTS on");
  const health = await visit(`${api}/health`);
  check(health.status === 200, `api health ${health.status}`);

  step("owner signs in with the one-time password");
  await page.goto(`${admin}/login`);
  await hydrated(page, "login-username");
  await page.getByTestId("login-username").fill(owner);
  await page.getByTestId("login-password").fill(tempPassword);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/change-password/);
  await page.getByTestId("forced-password-change").waitFor();
  check(true, "the password change is forced");
  const cookies = await context.cookies(admin);
  check(cookies.length > 0 && cookies.every((c) => c.secure && c.httpOnly && c.sameSite === "Strict"),
    `session cookies Secure, httpOnly, SameSite=Strict (${cookies.map((c) => c.name).join(", ")})`);
  await page.getByTestId("current-password").fill(tempPassword);
  await page.getByTestId("new-password").fill(newPassword);
  await page.getByTestId("confirm-password").fill(newPassword);
  await page.getByTestId("change-password-submit").click();
  await page.getByTestId("dashboard").waitFor();
  await page.screenshot({ path: path.join(outDir, "1-dashboard.png") });
  check(true, "dashboard reached with the new password");

  step("a department and a subcategory");
  await page.goto(`${admin}/catalog/categories`);
  await hydrated(page, "category-new");
  await page.getByTestId("category-new").click();
  const form = page.getByTestId("category-form");
  await form.getByTestId("category-name-ar").fill(`إلكترونيات ${run}`);
  await form.getByTestId("dialog-submit").click();
  await form.waitFor({ state: "hidden" });
  const department = page.locator('[data-testid^="department-"]', { hasText: `إلكترونيات ${run}` });
  await department.waitFor();
  await department.locator('[data-testid^="category-add-child-"]').first().click();
  await form.getByTestId("category-name-ar").fill(`سماعات ${run}`);
  await form.getByTestId("dialog-submit").click();
  await form.waitFor({ state: "hidden" });
  check(true, "categories created");

  step("a product with a picture, published");
  await page.goto(`${admin}/catalog/products/new`);
  await hydrated(page, "product-editor");
  await page.getByTestId("product-name-ar").fill(`سماعة لاسلكية ${run}`);
  // The admin's shared Select (a listbox, not a native <select>).
  await page.getByTestId("product-category").click();
  await page.getByRole("option", { name: `سماعات ${run}` }).click();
  await page.getByTestId("product-price").fill("45000");
  await page.getByTestId("variant-sku-0").fill(`HEADSET-${run}`.toUpperCase());
  await page.getByTestId("product-images").getByTestId("product-images-input").setInputFiles([
    { name: "headset.png", mimeType: "image/png", buffer: png(1200, 900, [214, 228, 240]) },
  ]);
  // Each picture goes through the shared image editor (VIS-021): confirm the centred square.
  await page.getByTestId("product-images-editor-confirm").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="product-images-tile-0"]')?.getAttribute("data-phase") === "ready", null, { timeout: 60_000 });
  await page.getByTestId("product-status-active").check();
  await page.getByTestId("product-save").click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}\?created=1$/);
  const productId = new URL(page.url()).pathname.split("/").pop();
  await page.screenshot({ path: path.join(outDir, "2-product.png") });
  const imageUrl = await page.getByTestId("product-images").locator("img").first().getAttribute("src");
  const picture = await visit(imageUrl);
  check(imageUrl.startsWith(`${api}/media/`) && picture.status === 200 && /^image\//.test(picture.headers["content-type"] ?? ""),
    `product ${productId}; picture served over HTTPS by the API (${picture.headers["content-type"]}, ${picture.body.length} bytes)`);

  step("the store: closed to the public, open to the owner's preview link");
  const closed = await visit(`${store}/`);
  check(/noindex/.test(closed.body.toString("utf8")), `${store}/ shows the opening-soon page (noindex)`);
  const robots = (await visit(`${store}/robots.txt`)).body.toString("utf8");
  check(/Disallow: \//.test(robots), "robots.txt shuts crawlers out");
  await page.goto(`${store}/preview?t=${previewToken}`);
  await page.goto(`${store}/product/${productId}`);
  await page.getByText(`سماعة لاسلكية ${run}`).first().waitFor();
  await page.waitForLoadState("networkidle");
  const loaded = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length);
  await page.screenshot({ path: path.join(outDir, "3-store-preview.png") });
  check(loaded > 0, `preview shows the product page with its picture (${loaded} images loaded)`);

  await browser.close();
  console.log(`SMOKE OK product=${productId}`);
})().catch((error) => { console.error("SMOKE FAILED:", error); process.exit(1); });
