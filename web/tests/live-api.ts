import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * Shared plumbing for the live suites.
 *
 * Two things here earn their own module rather than being copied per spec.
 *
 * The first is telling "no backend" apart from "the backend said no". The
 * earlier helper called `response.ok()` and skipped the suite on anything
 * else, so a 429 from the rate limiter read as "nothing is running" and every
 * test skipped — a green run that had verified nothing. Only a transport
 * failure means absent now; a status, any status, means the API is there.
 *
 * The second is the rate limit itself. The API allows 120 requests per window
 * and a full live run brushes against that, so tokens are cached per phone and
 * `awaitQuota` waits the window out rather than letting the suite skip.
 */

export const API =
  process.env.PLAYWRIGHT_LIVE_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api/v1";

export const OTP = process.env.DEV_OTP ?? "000000";

/** Seeded accounts, by role. */
export const CUSTOMER_E164 = "+9647700000006";
export const CUSTOMER_LOCAL = "07700000006";
export const ADMIN_E164 = "+9647700000001";
export const AGENT_E164 = "+9647700000005";

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Is there an API at all?
 *
 * A 429 or a 500 still means yes — the suite should run and fail honestly
 * rather than skip and look green.
 */
export async function reachable(request: APIRequestContext): Promise<boolean> {
  try {
    await request.get(`${API}/settings`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The one gate every live spec opens with.
 *
 * Under `npm run test:live` (playwright.live.config.ts sets
 * PLAYWRIGHT_LIVE_REQUIRED=1) a missing backend FAILS the test: that config
 * exists to exercise a real API, so a run that reached none has verified
 * nothing and must not report green. Anywhere else — the hermetic suite runs
 * live-catalog and live-checkout opportunistically — it skips as before.
 */
export async function requireLiveApi(
  request: APIRequestContext,
  what: string,
): Promise<void> {
  const up = await reachable(request);
  if (!up && process.env.PLAYWRIGHT_LIVE_REQUIRED === "1") {
    throw new Error(
      `No API at ${API}, but the live suite requires one to run ${what}.`,
    );
  }
  test.skip(!up, `No API at ${API} — start the backend to run ${what}.`);
}

/**
 * Wait until the rate-limit window has room again.
 *
 * `Retry-After` is in seconds and the window is short, so a handful of
 * attempts is plenty; if it never clears, the tests fail on their own
 * assertions instead of being quietly skipped.
 */
export async function awaitQuota(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.get(`${API}/settings`, { timeout: 5000 });
    if (response.status() !== 429) return;

    const retryAfter = Number(response.headers()["retry-after"] ?? "5");
    const seconds = Number.isFinite(retryAfter) ? retryAfter : 5;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(seconds, 60) * 1000 + 500),
    );
  }
}

/**
 * Access tokens, cached per phone for the life of the worker.
 *
 * Signing in costs two requests, and a spec that mints several orders would
 * otherwise spend a quarter of the rate-limit window just proving who it is.
 */
const tokens = new Map<string, string>();

export async function tokenFor(
  request: APIRequestContext,
  phone: string,
): Promise<string> {
  const cached = tokens.get(phone);
  if (cached) return cached;

  await awaitQuota(request);
  await request.post(`${API}/auth/request-otp`, { data: { phone } });
  const verified = await request.post(`${API}/auth/verify-otp`, {
    data: { phone, code: OTP },
  });
  expect(verified.ok()).toBe(true);

  const token = (await verified.json()).access_token as string;
  tokens.set(phone, token);
  return token;
}

export function customerToken(request: APIRequestContext): Promise<string> {
  return tokenFor(request, CUSTOMER_E164);
}

/**
 * Sign in through the real phone-OTP form and land on `next`.
 *
 * /login is the storefront's own entry point and honours ?next=, so this is
 * the returning customer's path rather than a test-only shortcut — no token is
 * injected, the OTP round trip really happens.
 */
export async function signIn(page: Page, next: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // The form is rendered twice (narrow and wide); only one is ever visible.
  const phone = page.locator('[data-testid="auth-phone"]:visible');
  await expect(phone).toBeVisible();
  await phone.fill(CUSTOMER_LOCAL);
  await page.locator('[data-testid="auth-send-otp"]:visible').click();
  await page.locator('[data-testid="auth-code"]:visible').fill(OTP);
  await page.locator('[data-testid="auth-verify"]:visible').click();
  // The redirect is what tells us the session is actually established.
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}
