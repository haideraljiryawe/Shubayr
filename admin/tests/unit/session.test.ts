import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetRefreshCache, refreshSession } from "@/lib/session/refresh";
import { isProxyablePath } from "@/lib/session/proxy-paths";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedCookies,
  cookieOptions,
  needsRefresh,
  sessionCookies,
  tokenExpiry,
} from "@/lib/session/tokens";

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("session cookies", () => {
  const now = 1_800_000_000;

  it("reads the expiry without trusting anything else", () => {
    expect(tokenExpiry(jwt({ exp: now + 900 }))).toBe(now + 900);
    expect(tokenExpiry("not-a-jwt")).toBeNull();
    expect(tokenExpiry(jwt({ sub: "x" }))).toBeNull();
  });

  it("refreshes a missing, unreadable or nearly-expired token", () => {
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh("garbage", now)).toBe(true);
    expect(needsRefresh(jwt({ exp: now + 30 }), now)).toBe(true);
    expect(needsRefresh(jwt({ exp: now + 900 }), now)).toBe(false);
  });

  it("writes httpOnly, SameSite=Strict cookies that die with their token", () => {
    const access = jwt({ exp: now + 900 });
    const refresh = jwt({ exp: now + 30 * 86400 });
    const cookies = sessionCookies(
      { access_token: access, refresh_token: refresh },
      true,
      now,
    );
    expect(cookies).toEqual([
      [
        ACCESS_COOKIE,
        access,
        {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          path: "/",
          maxAge: 900,
        },
      ],
      [
        REFRESH_COOKIE,
        refresh,
        {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          path: "/",
          maxAge: 30 * 86400,
        },
      ],
    ]);
  });

  it("never gives an expired token a negative lifetime, and bounds an unknown one", () => {
    expect(cookieOptions(jwt({ exp: now - 5 }), true, now).maxAge).toBe(0);
    expect(cookieOptions("opaque", false, now)).toMatchObject({
      maxAge: 900,
      secure: false,
    });
  });

  it("clears both cookies", () => {
    expect(
      clearedCookies(true).map(([name, value, options]) => [
        name,
        value,
        options.maxAge,
      ]),
    ).toEqual([
      [ACCESS_COOKIE, "", 0],
      [REFRESH_COOKIE, "", 0],
    ]);
  });
});

describe("refreshSession", () => {
  afterEach(() => __resetRefreshCache());

  it("runs one refresh for concurrent callers holding the same token", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: "a2", refresh_token: "r2" }),
          { status: 200 },
        ),
    );
    const results = await Promise.all([
      refreshSession("r1", fetcher as unknown as typeof fetch),
      refreshSession("r1", fetcher as unknown as typeof fetch),
      refreshSession("r1", fetcher as unknown as typeof fetch),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { access_token: "a2", refresh_token: "r2" },
      { access_token: "a2", refresh_token: "r2" },
      { access_token: "a2", refresh_token: "r2" },
    ]);
    // A request that arrives a moment later with the rotated-out token gets
    // the same pair instead of a refused refresh.
    await expect(
      refreshSession("r1", fetcher as unknown as typeof fetch),
    ).resolves.toEqual({
      access_token: "a2",
      refresh_token: "r2",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("forgets a refused refresh so the next caller may retry", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(
      refreshSession("bad", fetcher as unknown as typeof fetch),
    ).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await refreshSession("bad", fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats a network failure as no session", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(
      refreshSession("r", fetcher as unknown as typeof fetch),
    ).resolves.toBeNull();
  });
});

describe("isProxyablePath", () => {
  it.each([
    ["/admin/staff", true],
    ["/admin/staff/123/access", true],
    ["/admin/work-phones/%2B9647700000005", true],
    ["/admin/auth/login", false],
    ["/admin/auth/change-password", false],
    ["/admin", false],
    ["/me", false],
    ["/auth/refresh", false],
    ["/admin/../auth/refresh", false],
    ["/orders", false],
  ])("%s → %s", (path, allowed) => {
    expect(isProxyablePath(path)).toBe(allowed);
  });

  const id = "10000000-0000-4000-8000-000000000001";
  it.each([
    ["GET", "/me/notifications", true],
    ["GET", "/me/notifications/unread-count", true],
    ["PATCH", "/me/notifications/read-all", true],
    ["PATCH", `/me/notifications/${id}/read`, true],
    ["PATCH", `/deliveries/${id}/assign`, true],
    // Each extra route is pinned to its method and shape…
    ["DELETE", "/me/notifications", false],
    ["POST", `/deliveries/${id}/assign`, false],
    ["PATCH", `/deliveries/${id}`, false],
    ["GET", "/deliveries/assigned", false],
    ["PATCH", "/me/notifications/not-a-uuid/read", false],
    // …and the stream ticket is minted only by the BFF's own stream route.
    ["POST", "/notifications/stream-ticket", false],
    ["GET", "/notifications/stream", false],
    ["GET", "/me/notification-preferences", false],
  ])("%s %s → %s", (method, path, allowed) => {
    expect(isProxyablePath(path, method)).toBe(allowed);
  });
});
