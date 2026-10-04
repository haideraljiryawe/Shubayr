import { expect, test } from "@playwright/test";
import { FakeApi, type Seen } from "./fake-api";

/**
 * The store forwards each shopper's address on its own server-side API calls
 * (WORK_TESTS=true: the store's server talks to the scripted API, which
 * records every request's headers). This runner reaches the store from
 * loopback, which the store trusts as its front proxy, like a reverse proxy
 * appending what it saw; 192.0.2.10 stands for a trusted CDN hop.
 */

const api = new FakeApi();

test.beforeAll(async () => {
  await api.start();
});
test.afterAll(async () => {
  await api.stop();
});
test.beforeEach(() => {
  api.reset();
});

/** The settings read the store's server made to render one page. */
async function renderWith(request: import("@playwright/test").APIRequestContext, forwardedFor?: string): Promise<Seen[]> {
  const before = api.seen.length;
  const response = await request.get("/login", {
    headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {},
  });
  expect(response.ok()).toBe(true);
  const calls = api.seen.slice(before).filter((seen) => seen.path === "/settings");
  expect(calls.length, "the render reads the store settings").toBeGreaterThan(0);
  return calls;
}

function forwarded(calls: Seen[]) {
  return calls.map((seen) => ({ xff: seen.headers["x-forwarded-for"], xri: seen.headers["x-real-ip"] }));
}

test.describe("the store forwards the shopper's address", () => {
  test("the address its trusted front proxy saw reaches the API, in both headers", async ({ request }) => {
    for (const call of forwarded(await renderWith(request, "203.0.113.7"))) {
      expect(call).toEqual({ xff: "203.0.113.7", xri: "203.0.113.7" });
    }
  });

  test("a spoofed client entry is dropped, never passed through", async ({ request }) => {
    for (const call of forwarded(await renderWith(request, "6.6.6.6, 203.0.113.8"))) {
      expect(call).toEqual({ xff: "203.0.113.8", xri: "203.0.113.8" });
    }
  });

  test("a trusted CDN hop is skipped to the shopper behind it", async ({ request }) => {
    for (const call of forwarded(await renderWith(request, "6.6.6.6, 203.0.113.11, 192.0.2.10"))) {
      expect(call).toEqual({ xff: "203.0.113.11", xri: "203.0.113.11" });
    }
  });

  test("an untrusted proxy's claim about whom it forwards is ignored", async ({ request }) => {
    for (const call of forwarded(await renderWith(request, "203.0.113.9, 198.51.100.77"))) {
      expect(call).toEqual({ xff: "198.51.100.77", xri: "198.51.100.77" });
    }
  });

  test("with only trusted hops in the chain nothing is forwarded", async ({ request }) => {
    // No header: the store sees just the runner's own loopback address.
    for (const call of forwarded(await renderWith(request))) {
      expect(call).toEqual({ xff: undefined, xri: undefined });
    }
  });
});
