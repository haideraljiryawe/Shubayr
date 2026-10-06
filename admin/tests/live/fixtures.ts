import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Every test is its own client.
 *
 * The API limits each client address per route and per minute: 30 for
 * sign-ins, cart writes and orders, and 120 for other reads (C5c). When all
 * tests shared this runner's address, they spent much of the run waiting
 * those windows out.
 *
 * The admin trusts this runner as its front proxy
 * (TRUSTED_FRONT_PROXIES=loopback in playwright.live.config.ts), and the API
 * trusts both the admin and this runner (TRUSTED_PROXIES). So the address set
 * here is the one the API counts, for:
 * - the browser, through the admin's server;
 * - this runner's own API calls;
 * - any context the test opens.
 *
 * Addresses come from 198.18.0.0/15 (the benchmarking range): never a trusted
 * proxy, and clear of the documentation blocks forwarding.spec.ts uses. That
 * spec keeps Playwright's own `test`: its rate-limit and lockout tests choose
 * their addresses themselves.
 */
let sequence = 0;

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    sequence += 1;
    const address = `198.18.${(testInfo.workerIndex % 250) + 1}.${(sequence % 250) + 1}`;
    await provide({ ...extraHTTPHeaders, "X-Forwarded-For": address });
  },
});
