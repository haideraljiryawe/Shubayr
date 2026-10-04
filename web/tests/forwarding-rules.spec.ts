import { expect, test } from "@playwright/test";
import { compileTrust, forwardedHeaders, normalizeAddress, shopperAddress } from "../src/lib/forwarding";

/**
 * Which address the store forwards to the API, from the X-Forwarded-For
 * chain it received (src/lib/forwarding.ts). Pure rules — no server.
 */

const trusted = compileTrust("loopback, 10.0.0.0/8, 192.0.2.10, 2001:db8::/32");

test.describe("forwarding rules", () => {
  test("the address the trusted proxy saw is the shopper", () => {
    expect(shopperAddress("203.0.113.7", trusted)).toBe("203.0.113.7");
  });

  test("a client-supplied entry left of the proxy's is ignored", () => {
    expect(shopperAddress("6.6.6.6, 203.0.113.8", trusted)).toBe("203.0.113.8");
    expect(shopperAddress("6.6.6.6, 7.7.7.7, 203.0.113.8", trusted)).toBe("203.0.113.8");
  });

  test("trusted hops (a CDN, an internal balancer) are skipped", () => {
    expect(shopperAddress("6.6.6.6, 203.0.113.11, 192.0.2.10", trusted)).toBe("203.0.113.11");
    expect(shopperAddress("203.0.113.12, 10.1.2.3, 127.0.0.1", trusted)).toBe("203.0.113.12");
  });

  test("an untrusted proxy is believed only about itself, never about whom it claims to forward", () => {
    expect(shopperAddress("203.0.113.9, 198.51.100.77", trusted)).toBe("198.51.100.77");
  });

  test("nothing is forwarded without trusted proxies, or when the chain can't be judged", () => {
    expect(shopperAddress("203.0.113.7", compileTrust(""))).toBeNull();
    expect(shopperAddress("203.0.113.7", compileTrust(undefined))).toBeNull();
    expect(shopperAddress(null, trusted)).toBeNull();
    expect(shopperAddress("", trusted)).toBeNull();
    // Only proxies in the chain: the shopper isn't in it.
    expect(shopperAddress("127.0.0.1", trusted)).toBeNull();
    // A malformed hop: nothing past it is believed.
    expect(shopperAddress("203.0.113.7, not-an-ip", trusted)).toBeNull();
    expect(shopperAddress("unknown", trusted)).toBeNull();
  });

  test("addresses are read the way proxies write them", () => {
    expect(normalizeAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeAddress("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(normalizeAddress("[2001:db8::5]")).toBe("2001:db8::5");
    expect(shopperAddress("2001:db8::5, ::1", trusted)).toBeNull();
    expect(shopperAddress("2a00:1450::1, ::ffff:127.0.0.1", trusted)).toBe("2a00:1450::1");
  });

  test("a bad TRUSTED_FRONT_PROXIES entry fails loudly instead of trusting nothing", () => {
    expect(() => compileTrust("loopback, proxy.internal")).toThrow(/TRUSTED_FRONT_PROXIES/);
  });

  test("the API gets the shopper's address in both headers, or no header at all", () => {
    expect(forwardedHeaders("203.0.113.7")).toEqual({ "X-Forwarded-For": "203.0.113.7", "X-Real-IP": "203.0.113.7" });
    expect(forwardedHeaders(null)).toEqual({});
  });
});
