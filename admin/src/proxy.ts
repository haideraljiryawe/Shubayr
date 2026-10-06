import { NextResponse, type NextRequest } from "next/server";
import { API_URL, ADMIN_ORIGIN, COOKIE_SECURE } from "@/lib/config";
import { contentSecurityPolicy, newNonce, originOf } from "@/lib/security-headers";
import { clientForwardHeaders } from "@/lib/session/forwarding";
import { refreshSession } from "@/lib/session/refresh";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedCookies,
  needsRefresh,
  sessionCookies,
} from "@/lib/session/tokens";

/* ---------------------------------------------------------------------------
 * The session gate for every page (Next 16 "proxy", formerly middleware).
 *
 * Server components cannot write cookies, so the refresh happens here, before
 * rendering: an access token that is missing or about to expire is swapped
 * using the refresh cookie, the new pair is written to the response AND to
 * the request the page renders with — so the page's own API calls already
 * carry the fresh token. No session at all means the sign-in page.
 *
 * This is a convenience gate, not the security boundary: the API checks the
 * token and the permission on every call.
 *
 * Every page response also carries the Content-Security-Policy, built around
 * a per-request nonce that goes on the request too, so Next.js stamps it on
 * the scripts it renders.
 * ------------------------------------------------------------------------- */

const MEDIA_ORIGIN = originOf(API_URL);
const HTTPS = (ADMIN_ORIGIN ?? "").startsWith("https://");

const PUBLIC_PATHS = new Set(["/login"]);

function toLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const response = NextResponse.redirect(url);
  for (const [name, value, options] of clearedCookies(COOKIE_SECURE)) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy({
    nonce: newNonce(),
    dev: process.env.NODE_ENV !== "production",
    mediaOrigin: MEDIA_ORIGIN,
    https: HTTPS,
  });
  request.headers.set("Content-Security-Policy", csp);
  const response = await gate(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function gate(request: NextRequest): Promise<NextResponse> {
  const isPublic = PUBLIC_PATHS.has(request.nextUrl.pathname);
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!needsRefresh(access)) {
    if (isPublic) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const pair = refresh ? await refreshSession(refresh, fetch, clientForwardHeaders(request.headers)) : null;
  if (!pair) return isPublic ? NextResponse.next({ request: { headers: request.headers } }) : toLogin(request);

  if (isPublic) {
    const response = NextResponse.redirect(new URL("/", request.url));
    for (const [name, value, options] of sessionCookies(pair, COOKIE_SECURE)) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  // Hand the fresh pair to this very render, then to the browser.
  request.cookies.set(ACCESS_COOKIE, pair.access_token);
  request.cookies.set(REFRESH_COOKIE, pair.refresh_token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const [name, value, options] of sessionCookies(pair, COOKIE_SECURE)) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  // Pages only: route handlers refresh for themselves (src/lib/session/bff.ts),
  // and Next internals and files with an extension are never gated.
  matcher: "/((?!api|_next|.*\\..*).*)",
};
