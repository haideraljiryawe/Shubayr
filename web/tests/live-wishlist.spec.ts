import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from "@playwright/test";
import {
  API,
  awaitQuota,
  bearer,
  customerToken,
  requireLiveApi,
  signIn,
} from "./live-api";

/**
 * The wishlist, in a browser, against the real API.
 *
 * Signed in, GET /wishlist is the authority and the page renders the product
 * each row carries, priced by the server. A guest's hearts stay on the device
 * and are replayed through POST /wishlist exactly once at sign-in.
 *
 * Every test starts from an empty server wishlist for the seeded customer, so
 * the suite is repeatable and order-independent.
 */

/** Seeded, active, on sale (a percentage discount), and in stock. */
const EARBUDS = "40000000-0000-4000-8000-000000000001";
const WISHLIST_KEY = "shubayr.wishlist.v1";

interface WishlistRow {
  id: string;
  product_id: string;
  product: { id: string; price: number; effective_price: number };
}

async function serverWishlist(
  request: APIRequestContext,
): Promise<{ total: number; data: WishlistRow[] }> {
  const response = await request.get(`${API}/wishlist?per_page=100`, {
    headers: bearer(await customerToken(request)),
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function emptyServerWishlist(request: APIRequestContext): Promise<void> {
  const token = await customerToken(request);
  for (const row of (await serverWishlist(request)).data) {
    const removed = await request.delete(`${API}/wishlist/${row.product_id}`, {
      headers: bearer(token),
    });
    expect(removed.status()).toBe(204);
  }
}

/** Browser-side POST /wishlist calls — the replay count is the point. */
function countWishlistPosts(page: Page): () => number {
  let count = 0;
  page.on("request", (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/wishlist")
    ) {
      count += 1;
    }
  });
  return () => count;
}

function storedGuestList(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"),
    WISHLIST_KEY,
  );
}

/** The product page's own heart, not one from the related rail. */
function productHeart(page: Page) {
  return page.getByTestId("pdp-wishlist");
}

test.describe("live wishlist", () => {
  test.beforeEach(async ({ request, page }) => {
    await requireLiveApi(request, "the live wishlist tests");
    await awaitQuota(request);
    await emptyServerWishlist(request);

    // Nothing carries over between tests: no session, no guest hearts.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("a heart adds to the account, appears on the page, and removes", async ({
    page,
    request,
  }) => {
    await signIn(page, `/product/${EARBUDS}`);

    const heart = productHeart(page);
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    const added = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/wishlist"),
    );
    await heart.click();
    expect((await added).status()).toBeLessThan(300);
    await expect(heart).toHaveAttribute("aria-pressed", "true");

    // It is on the account, not merely on this device.
    const stored = await serverWishlist(request);
    expect(stored.total).toBe(1);
    expect(stored.data[0].product_id).toBe(EARBUDS);
    expect(await storedGuestList(page)).toEqual([]);

    // A fresh load reads the heart back from the server.
    await page.reload();
    await expect(productHeart(page)).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account/wishlist");
    const grid = page.getByTestId("wishlist-grid");
    await expect(grid.locator("> li")).toHaveCount(1);
    await expect(page.getByTestId(`wishlist-remove-${EARBUDS}`)).toBeVisible();

    await page.getByTestId(`wishlist-remove-${EARBUDS}`).click();
    await expect(page.getByText("قائمة المفضلة فارغة")).toBeVisible();
    await expect
      .poll(async () => (await serverWishlist(request)).total)
      .toBe(0);
  });

  test("the page renders the server's price, not one it worked out", async ({
    page,
    request,
  }) => {
    const token = await customerToken(request);
    const added = await request.post(`${API}/wishlist`, {
      headers: bearer(token),
      data: { product_id: EARBUDS },
    });
    expect(added.ok()).toBe(true);
    const row = (await added.json()) as WishlistRow;
    // The seeded product is on sale, so there is a discount the client could
    // be tempted to apply itself.
    expect(row.product.effective_price).toBeLessThan(row.product.price);

    // Hand the page a GET /wishlist whose effective price no client-side
    // arithmetic could produce from `price` and the discount. If the tile
    // shows it, the tile is rendering what the server sent. A whole number,
    // because the store currency may format with no decimals at all.
    const SENTINEL = 13;
    expect(Math.round(row.product.effective_price)).not.toBe(SENTINEL);
    // Scoped to the API: the storefront's own /account/wishlist page would
    // otherwise match too.
    await page.route(
      (url) => url.href.startsWith(`${API}/wishlist`),
      async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        for (const item of body.data) item.product.effective_price = SENTINEL;
        await route.fulfill({ response, json: body });
      },
    );

    await signIn(page, "/account/wishlist");
    const tile = page.getByTestId("wishlist-grid").locator("> li").first();
    // Price renders the paid amount first, then the struck regular price, as
    // siblings — which is what tells it apart from the rating beside it.
    const amounts = tile.locator("span:has(> .line-through) > span");
    await expect(amounts.first()).toContainText(String(SENTINEL));
    // The struck regular price is the server's `price`, also untouched.
    // Compared digit for digit: the price is rendered grouped ("20,150 د.ع").
    await expect
      .poll(async () =>
        (await tile.locator(".line-through").innerText()).replace(/\D/g, ""),
      )
      .toBe(String(Math.trunc(row.product.price)));
  });

  test("adding twice never duplicates, from the API or the page", async ({
    page,
    request,
  }) => {
    const token = await customerToken(request);
    const add = () =>
      request.post(`${API}/wishlist`, {
        headers: bearer(token),
        data: { product_id: EARBUDS },
      });

    // Back to back, and racing each other.
    const first = await add();
    const second = await add();
    const [third, fourth] = await Promise.all([add(), add()]);
    const ids = await Promise.all(
      [first, second, third, fourth].map(async (response) => {
        expect(response.ok()).toBe(true);
        return (await response.json()).id as string;
      }),
    );
    expect(new Set(ids).size).toBe(1);
    expect((await serverWishlist(request)).total).toBe(1);

    // The page: a guest heart for a product the account already holds is
    // replayed at sign-in, and still lands as the one row.
    await page.goto(`/product/${EARBUDS}`);
    await productHeart(page).click();
    expect(await storedGuestList(page)).toEqual([EARBUDS]);

    await signIn(page, "/account/wishlist");
    await expect(
      page.getByTestId("wishlist-grid").locator("> li"),
    ).toHaveCount(1);
    expect((await serverWishlist(request)).total).toBe(1);
  });

  test("a guest heart is replayed onto the account exactly once", async ({
    page,
    request,
  }) => {
    const posts = countWishlistPosts(page);

    await page.goto(`/product/${EARBUDS}`);
    await productHeart(page).click();
    expect(await storedGuestList(page)).toEqual([EARBUDS]);
    // A guest heart is device-only: nothing has been sent yet.
    expect(posts()).toBe(0);

    await signIn(page, "/account/wishlist");
    await expect(
      page.getByTestId("wishlist-grid").locator("> li"),
    ).toHaveCount(1);

    // One POST, even though development React mounts effects twice…
    expect(posts()).toBe(1);
    // …and the device queue is empty, so nothing is left to replay.
    expect(await storedGuestList(page)).toEqual([]);

    // Removed on "another device": straight through the API.
    const removed = await request.delete(`${API}/wishlist/${EARBUDS}`, {
      headers: bearer(await customerToken(request)),
    });
    expect(removed.status()).toBe(204);

    // A reload must not resurrect it by replaying the pick again.
    await page.reload();
    await expect(page.getByText("قائمة المفضلة فارغة")).toBeVisible();
    expect(posts()).toBe(1);
    expect((await serverWishlist(request)).total).toBe(0);
  });
});
