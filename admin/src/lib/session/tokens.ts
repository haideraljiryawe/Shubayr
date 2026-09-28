/* ---------------------------------------------------------------------------
 * Session cookies — pure helpers, no Next.js imports, so they are unit-tested.
 *
 * The admin never lets a token reach JavaScript. Both halves of the pair live
 * in httpOnly cookies written by this app's route handlers and proxy, and the
 * browser only ever talks to this app (see src/app/api). Cookies are:
 *
 *   httpOnly     — unreadable from page scripts, so XSS cannot lift a token;
 *   Secure       — HTTPS only (browsers also accept it on http://localhost);
 *   SameSite=Strict — never sent on a cross-site request, the CSRF baseline;
 *   Path=/       — the proxy, the pages and the route handlers all need them.
 *
 * Their lifetime follows each JWT's own `exp`, so a cookie never outlives the
 * token inside it.
 * ------------------------------------------------------------------------- */

export const ACCESS_COOKIE = "shubayr_admin_at";
export const REFRESH_COOKIE = "shubayr_admin_rt";

/** Refresh this many seconds before the access token actually expires. */
export const EXPIRY_SKEW_SECONDS = 60;

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
  maxAge: number;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return typeof atob === "function"
    ? atob(padded)
    : Buffer.from(padded, "base64").toString("binary");
}

/**
 * The `exp` claim (seconds since the epoch), read WITHOUT verifying the
 * signature. It is only used to decide when to refresh; the API verifies
 * every token it is handed, so a forged `exp` buys nothing.
 */
export function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/** True when the token is missing, unreadable, expired or about to expire. */
export function needsRefresh(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!token) return true;
  const exp = tokenExpiry(token);
  return exp === null || exp - EXPIRY_SKEW_SECONDS <= nowSeconds;
}

export function cookieOptions(
  token: string,
  secure: boolean,
  nowSeconds = Math.floor(Date.now() / 1000),
): CookieOptions {
  const exp = tokenExpiry(token);
  // A token without a readable expiry still gets a bounded cookie.
  const maxAge = exp === null ? 15 * 60 : Math.max(0, exp - nowSeconds);
  return { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge };
}

/** The two cookies that store a token pair, ready for `cookies.set(...)`. */
export function sessionCookies(
  pair: TokenPair,
  secure: boolean,
  nowSeconds?: number,
): Array<[string, string, CookieOptions]> {
  return [
    [
      ACCESS_COOKIE,
      pair.access_token,
      cookieOptions(pair.access_token, secure, nowSeconds),
    ],
    [
      REFRESH_COOKIE,
      pair.refresh_token,
      cookieOptions(pair.refresh_token, secure, nowSeconds),
    ],
  ];
}

/** Expired copies of both cookies — setting these signs the browser out. */
export function clearedCookies(
  secure: boolean,
): Array<[string, string, CookieOptions]> {
  const expired: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  };
  return [
    [ACCESS_COOKIE, "", expired],
    [REFRESH_COOKIE, "", expired],
  ];
}
