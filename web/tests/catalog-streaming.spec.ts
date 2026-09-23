import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mockCategories, mockProducts, mockSettings } from "../src/lib/mock-data";

// Real server-side fetches need an API fixture; page.route cannot intercept them.
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

let server: Server;
let products: ReturnType<typeof gate> | undefined;
let reviews: ReturnType<typeof gate> | undefined;
let reviewsRequested: ReturnType<typeof gate> | undefined;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    let body: unknown;
    if (path === "/api/v1/settings") body = mockSettings;
    else if (path === "/api/v1/categories") {
      body = [
        ...mockCategories,
        { id: "inactive", slug: "inactive", is_active: false },
      ];
    } else if (path === "/api/v1/products") {
      await products?.promise;
      body = { data: [mockProducts[0]], total: 1, page: 1, per_page: 12 };
    } else if (/\/products\/[^/]+\/reviews$/.test(path)) {
      reviewsRequested?.release();
      await reviews?.promise;
      body = { data: [], total: 0, page: 1, per_page: 1 };
    } else {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.PLAYWRIGHT_API_PORT ?? 3101), "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  products?.release();
  reviews?.release();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

for (const prefix of ["", "/en"]) {
  test(`category listing streams after validation: ${prefix || "/ar"}`, async ({ page }) => {
    products = gate();
    reviews = gate();
    reviewsRequested = gate();
    try {
      const response = await page.goto(`${prefix}/category/electronics`, {
        waitUntil: "commit",
      });
      expect(response?.status()).toBe(200);
      // The app shell keeps an always-mounted toast live region, which is also
      // a role="status"; the loading skeleton is the labelled one.
      const skeleton = page.getByRole("status", {
        name: prefix === "/en" ? "Loading…" : "جارٍ التحميل…",
      });
      await expect(skeleton).toBeVisible();
      await expect(skeleton.locator(".animate-pulse, .motion-safe\\:animate-pulse")).toBeVisible();
      await expect(page.getByTestId("product-grid")).toHaveCount(0);

      products.release();
      await reviewsRequested.promise;
      await expect(skeleton).toBeVisible();
      await expect(page.getByTestId("product-grid")).toHaveCount(0);

      reviews.release();
      await expect(page.getByTestId("product-grid")).toBeVisible();
      await expect(skeleton).toHaveCount(0);
    } finally {
      products.release();
      reviews.release();
    }
  });

  for (const slug of ["bogus-slug", "inactive"]) {
    test(`unavailable category has HTTP 404 with API data: ${prefix}/${slug}`, async ({ page }) => {
      const response = await page.goto(`${prefix}/category/${slug}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("product-grid")).toHaveCount(0);
    });
  }
}
