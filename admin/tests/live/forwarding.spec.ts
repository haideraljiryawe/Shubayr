import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, adminApiToken, bearer, createStaff, requireLiveApi } from "./helpers";

/**
 * The address the admin server passes to the API (lib/session/forwarding.ts),
 * proved where it matters: the API's audit log of sign-in attempts, its
 * per-address login limit (30 a minute) and account lockout.
 *
 * This runner stands in for the admin's front proxy (TRUSTED_FRONT_PROXIES
 * includes loopback in playwright.live.config.ts), so the X-Forwarded-For it
 * sends is what a proxy would append: the client's real address last, with
 * whatever the client claimed before it. The API trusts the admin server
 * (TRUSTED_PROXIES). Addresses are documentation ranges, one block per run.
 */

test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// A fresh /24-style octet per run, so reruns on one database never share a
// rate-limit bucket: 203.0.113.<n> and 198.51.100.<n>.
const octet = 20 + (Date.now() % 200);
const real = (offset: number) => `203.0.113.${(octet + offset) % 250}`;
const untrusted = (offset: number) => `198.51.100.${(octet + offset) % 250}`;

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

/** A sign-in through the admin's own login route, as a browser behind the proxy. */
async function signIn(request: APIRequestContext, forwardedFor: string, username: string, password = "Wrong-Pass!1x") {
  const origin = test.info().project.use.baseURL!;
  const response = await request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin, "X-Forwarded-For": forwardedFor },
    data: { username, password },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

/** The address the API recorded for this username's sign-in attempts. */
async function recordedAddresses(request: APIRequestContext, username: string): Promise<string[]> {
  const response = await request.get(`${API}/admin/audit-logs?action=admin.login&per_page=100`, {
    headers: bearer(await adminApiToken(request)),
  });
  expect(response.ok(), await response.text()).toBe(true);
  const page = (await response.json()) as { data: Array<{ after: { username?: string } | null; ip: string | null }> };
  return page.data.filter((entry) => entry.after?.username === username).map((entry) => entry.ip ?? "");
}

test("the API records the address the trusted proxy saw, never what the client claimed", async ({ request }) => {
  const spoofed = `ghost-a-${run}`;
  expect((await signIn(request, `6.6.6.6, 7.7.7.7, ${real(0)}`, spoofed)).status).toBe(401);
  await expect.poll(() => recordedAddresses(request, spoofed)).toEqual([real(0)]);

  // An untrusted proxy in the chain is believed only about itself.
  const relayed = `ghost-b-${run}`;
  expect((await signIn(request, `${real(1)}, ${untrusted(1)}`, relayed)).status).toBe(401);
  await expect.poll(() => recordedAddresses(request, relayed)).toEqual([untrusted(1)]);
});

test("the login limit counts the real address, however the client varies what it claims", async ({ request }) => {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 32; attempt += 1) {
    // A different made-up address every time, the same real one behind it.
    const result = await signIn(request, `10.${attempt}.0.1, 9.9.9.${attempt}, ${real(2)}`, `ghost-c-${run}-${attempt}`);
    statuses.push(result.status);
    if (result.status === 429) {
      expect(result.body?.code).not.toBe("ACCOUNT_LOCKED");
      break;
    }
  }
  expect(statuses.at(-1), `statuses: ${statuses.join(",")}`).toBe(429);
  expect(statuses.filter((status) => status === 401).length).toBeGreaterThanOrEqual(25);

  // Another real address has its own, untouched budget.
  expect((await signIn(request, real(3), `ghost-d-${run}`)).status).toBe(401);
});

test("an account locks after repeated failures, recorded against the real address", async ({ request }) => {
  const staff = await createStaff(request, { prefix: "fwdlock" });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    expect((await signIn(request, `6.6.6.${attempt}, ${real(4)}`, staff.username, `Wrong-Pass!${attempt}x`)).status).toBe(401);
  }
  const locked = await signIn(request, `8.8.8.8, ${real(4)}`, staff.username, staff.password);
  expect(locked.status).toBe(429);
  expect(locked.body?.code).toBe("ACCOUNT_LOCKED");
  await expect
    .poll(async () => {
      const addresses = await recordedAddresses(request, staff.username);
      return addresses.length >= 6 && addresses.every((address) => address === real(4));
    })
    .toBe(true);
});
