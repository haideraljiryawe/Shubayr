import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The staff member's address the admin server passes to the API: taken only
 * from trusted front proxies, never what a client sent (the BFF used to pass
 * the incoming X-Forwarded-For through untouched, which let a client choose
 * the address the API's per-address login limit counts).
 */

async function withTrust(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env.TRUSTED_FRONT_PROXIES;
  else process.env.TRUSTED_FRONT_PROXIES = value;
  const forwarding = await import("@/lib/session/forwarding");
  const bff = await import("@/lib/session/bff");
  return { ...forwarding, ...bff };
}

function request(forwardedFor?: string) {
  return new NextRequest("http://localhost:3200/api/proxy/admin/orders", {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
}

/** The headers the BFF sent the API for one forwarded call. */
async function sentHeaders(forward: typeof import("@/lib/session/bff").forward, forwardedFor?: string) {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  await forward(request(forwardedFor), { method: "GET", path: "/admin/orders", authenticated: false });
  return new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRUSTED_FRONT_PROXIES;
});

describe("clientForwardHeaders", () => {
  it("uses the address the trusted proxy saw, and drops what the client claimed", async () => {
    const { clientForwardHeaders } = await withTrust("loopback, 10.0.0.0/8");
    const headers = (value: string) => clientForwardHeaders(new Headers({ "x-forwarded-for": value }));
    expect(headers("203.0.113.5")).toEqual({ "X-Forwarded-For": "203.0.113.5", "X-Real-IP": "203.0.113.5" });
    expect(headers("6.6.6.6, 203.0.113.5")).toEqual({ "X-Forwarded-For": "203.0.113.5", "X-Real-IP": "203.0.113.5" });
    expect(headers("6.6.6.6, 203.0.113.5, 10.0.0.4")).toEqual({ "X-Forwarded-For": "203.0.113.5", "X-Real-IP": "203.0.113.5" });
    // An untrusted proxy is believed only about itself.
    expect(headers("203.0.113.5, 198.51.100.9")).toEqual({ "X-Forwarded-For": "198.51.100.9", "X-Real-IP": "198.51.100.9" });
    // Only trusted hops: the client isn't in the chain.
    expect(headers("127.0.0.1")).toEqual({});
  });

  it("forwards nothing without trusted proxies, whatever the client sent", async () => {
    const { clientForwardHeaders } = await withTrust(undefined);
    expect(clientForwardHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toEqual({});
  });

  it("refuses a TRUSTED_FRONT_PROXIES it can't read", async () => {
    const { checkTrustedFrontProxies } = await withTrust(undefined);
    expect(() => checkTrustedFrontProxies("loopback, proxy.internal")).toThrow(/TRUSTED_FRONT_PROXIES/);
    expect(() => checkTrustedFrontProxies("loopback, 10.0.0.0/8")).not.toThrow();
  });
});

describe("the BFF's calls to the API", () => {
  it("never pass a client's X-Forwarded-For on when nothing is trusted", async () => {
    const { forward } = await withTrust(undefined);
    const headers = await sentHeaders(forward, "6.6.6.6");
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(headers.get("x-real-ip")).toBeNull();
  });

  it("replace a spoofed chain with the one address the trusted proxy saw", async () => {
    const { forward } = await withTrust("loopback");
    const headers = await sentHeaders(forward, "6.6.6.6, 7.7.7.7, 203.0.113.20");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.20");
    expect(headers.get("x-real-ip")).toBe("203.0.113.20");
  });
});
