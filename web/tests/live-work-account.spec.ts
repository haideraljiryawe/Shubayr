import { expect, test } from "@playwright/test";
import {
  AGENT_E164,
  AGENT_LOCAL,
  API,
  MONITOR_LOCAL,
  bearer,
  requireLiveApi,
  signIn,
  tokenFor,
} from "./live-api";

/**
 * Work accounts against the REAL API (6.0).
 *
 * The seed registers +9647700000005 as a delivery agent and +9647700000008 as
 * an order monitor. Both sign in through the storefront's OTP form, and the
 * server — not the client — decides they are work accounts.
 */

const SESSION_KEY = "shubayr.session.v1";

test.describe("work accounts on the live store", () => {
  test.beforeEach(async ({ request }) => {
    await requireLiveApi(request, "the work-account suite");
  });

  test("the API refuses a work account every purchase function", async ({
    request,
  }) => {
    const agent = await tokenFor(request, AGENT_E164);
    for (const path of ["/cart", "/wishlist", "/addresses"]) {
      const response = await request.get(`${API}${path}`, {
        headers: bearer(agent),
      });
      expect(response.status(), path).toBe(403);
      expect((await response.json()).code, path).toBe(
        "WORK_ACCOUNT_SHOPPING_FORBIDDEN",
      );
    }
  });

  test("a delivery agent signing in sees only the landing", async ({
    page,
  }) => {
    await signIn(page, "/cart", AGENT_LOCAL);

    const landing = page.getByTestId("work-account-landing");
    await expect(landing).toHaveAttribute("data-role", "delivery_agent");
    await expect(page.getByTestId("header-cart")).toHaveCount(0);

    for (const path of ["/", "/account/wishlist", "/account/addresses"]) {
      await page.goto(path);
      await expect(landing, path).toBeVisible();
    }

    await page.getByTestId("work-account-signout").click();
    await expect(page.getByTestId("header-login")).toBeVisible();
  });

  test("an order monitor signing in sees only the landing", async ({
    page,
  }) => {
    await signIn(page, "/", MONITOR_LOCAL);
    await expect(page.getByTestId("work-account-landing")).toHaveAttribute(
      "data-role",
      "order_monitor",
    );
  });

  test("a refused purchase call flips a stale customer view to the landing", async ({
    page,
    request,
  }) => {
    // A session whose cached profile still says "customer" — as a tab opened
    // before the phone became a work phone would hold. The first cart call
    // answers 403 WORK_ACCOUNT_SHOPPING_FORBIDDEN, and the client re-reads
    // GET /me instead of showing a broken cart.
    const verified = await (async () => {
      await request.post(`${API}/auth/request-otp`, {
        data: { phone: AGENT_E164 },
      });
      const response = await request.post(`${API}/auth/verify-otp`, {
        data: {
          phone: AGENT_E164,
          code: process.env.DEV_OTP ?? "000000",
          client: "web_store",
        },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    })();

    await page.goto("/");
    await page.evaluate(
      ([key, session]) => window.localStorage.setItem(key, session),
      [
        SESSION_KEY,
        JSON.stringify({
          access_token: verified.access_token,
          refresh_token: verified.refresh_token,
          user: { ...verified.user, role: "customer" },
        }),
      ] as const,
    );

    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith("/cart") && response.status() === 403,
    );
    await page.goto("/cart");
    await refused;
    await expect(page.getByTestId("work-account-landing")).toHaveAttribute(
      "data-role",
      "delivery_agent",
    );
  });
});
