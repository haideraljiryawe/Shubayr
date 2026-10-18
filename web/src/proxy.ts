import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { contentSecurityPolicy, newNonce, originOf } from "./lib/security-headers";
import {
  COMING_SOON_SEGMENT,
  GATE_HEADER,
  PREVIEW_COOKIE,
  PREVIEW_MAX_AGE_SECONDS,
  localeOfPath,
  previewDigest,
  previewToken,
  isInfoPath,
  sameSecret,
  storeIsPublic,
  unprefixed,
  type StoreGate,
} from "./lib/store-gate";

/**
 * The proxy (Next 16's name for middleware) in front of every page.
 *
 * It resolves the locale. With `localePrefix: "as-needed"` this is what serves
 * Arabic at the bare path (`/`, `/style-guide`) and keeps English under `/en`
 * — without it, `/` 404s.
 *
 * It also issues the page's Content-Security-Policy around a per-request
 * nonce. The policy goes on the REQUEST too: Next.js reads the nonce from it
 * and stamps it on every script it renders (next-intl forwards the request
 * headers on its rewrites).
 *
 * And before the store opens (STORE_PUBLIC=false) it is the gate: every page
 * becomes the "opening soon" page unless the visitor holds the owner's preview
 * cookie (src/lib/store-gate.ts). The legal, support and account deletion
 * pages stay reachable, but are not indexed until the store opens.
 *
 * Must live in `src/` because the app uses a `src` directory; a proxy file at
 * the package root is silently ignored.
 */
const intl = createMiddleware(routing);

const API_ORIGIN = originOf(
  process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8000"),
);
const HTTPS = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

export default async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    apiOrigin: API_ORIGIN,
    https: HTTPS,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  // Only this proxy says whether the store is gated; never the client.
  request.headers.delete(GATE_HEADER);

  let response: NextResponse;
  if (storeIsPublic()) {
    response = intl(request);
  } else {
    const gate = await storeGate(request);
    if (gate instanceof NextResponse) {
      response = gate;
    } else {
      request.headers.set(GATE_HEADER, gate);
      response = intl(request);
      if (gate === "info") response.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    // Nothing behind the gate may be kept by a shared cache.
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * The closed store: the preview link, a valid preview cookie ("preview"), the
 * pages open to all ("info"), or the "opening soon" page for everyone else.
 */
async function storeGate(request: NextRequest): Promise<StoreGate | NextResponse> {
  const { pathname, searchParams } = request.nextUrl;
  const locale = localeOfPath(pathname);
  const home = new URL(locale === routing.defaultLocale ? "/" : `/${locale}`, request.url);
  const token = previewToken();
  const expected = token ? await previewDigest(token) : null;

  if (unprefixed(pathname) === "/preview") {
    if (searchParams.has("exit")) {
      const response = NextResponse.redirect(home);
      response.cookies.delete(PREVIEW_COOKIE);
      return response;
    }
    const offered = searchParams.get("t");
    if (expected && offered && sameSecret(await previewDigest(offered), expected)) {
      const response = NextResponse.redirect(home);
      response.cookies.set(PREVIEW_COOKIE, expected, {
        httpOnly: true,
        secure: HTTPS || request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: PREVIEW_MAX_AGE_SECONDS,
      });
      return response;
    }
    // A wrong or missing token looks exactly like the closed store.
  }

  const held = request.cookies.get(PREVIEW_COOKIE)?.value;
  if (expected && held && sameSecret(held, expected)) return "preview";
  if (isInfoPath(pathname)) return "info";

  const target = request.nextUrl.clone();
  target.pathname = `/${locale}/${COMING_SOON_SEGMENT}`;
  target.search = "";
  request.headers.set(GATE_HEADER, "closed");
  const response = NextResponse.rewrite(target, { request: { headers: request.headers } });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Skip API routes, Next internals, and any path with a file extension.
  // `\\.` is a literal dot: a single backslash would collapse to a plain `.`
  // and exclude nearly every route from the proxy.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
