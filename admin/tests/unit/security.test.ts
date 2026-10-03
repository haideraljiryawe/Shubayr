import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError, errorKind } from "@/lib/api/errors";
import { forward, isSameOrigin } from "@/lib/session/bff";
import { STATIC_SECURITY_HEADERS, contentSecurityPolicy } from "@/lib/security-headers";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("security headers", () => {
  it("a production CSP: nonce only, no inline or eval scripts, never framed, BFF-only connections", () => {
    const csp = contentSecurityPolicy({ nonce: "n0nce", dev: false, mediaOrigin: "https://api.example.com", https: true });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-n0nce' 'strict-dynamic'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("development adds only what the dev server needs", () => {
    const csp = contentSecurityPolicy({ nonce: "n", dev: true, mediaOrigin: null, https: false });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("the static headers: HSTS, nosniff, no framing, no indexing", () => {
    const headers = Object.fromEntries(STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]));
    expect(headers["Strict-Transport-Security"]).toMatch(/^max-age=\d{7,}; includeSubDomains$/);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("same-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });
});

describe("the BFF", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a mutation without this admin's Origin (CSRF)", () => {
    const at = (method: string, origin?: string) =>
      new NextRequest("http://localhost:3200/api/proxy/admin/presets", { method, headers: origin ? { origin } : {} });
    expect(isSameOrigin(at("GET"))).toBe(true);
    expect(isSameOrigin(at("POST", "http://localhost:3200"))).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isSameOrigin(at(method)), `${method} without Origin`).toBe(false);
      expect(isSameOrigin(at(method, "https://evil.example")), `${method} foreign`).toBe(false);
    }
  });

  it("answers a declared 503 API_UNAVAILABLE when the API can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const request = new NextRequest("http://localhost:3200/api/proxy/admin/orders");
    const result = await forward(request, { method: "GET", path: "/admin/orders", authenticated: false });
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toMatchObject({ status: 503, code: "API_UNAVAILABLE" });
    expect(result.signedOut).toBe(false);
    expect(errorKind(new ApiError(503, "x", "API_UNAVAILABLE"))).toBe("unavailable");
    expect(errorKind(new ApiError(502, "Bad gateway"))).toBe("unavailable");
  });
});
