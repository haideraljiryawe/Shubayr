import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { contentSecurityPolicy, newNonce, originOf } from "./lib/security-headers";

/**
 * Resolves the locale for every request. With `localePrefix: "as-needed"` this
 * is what serves Arabic at the bare path (`/`, `/style-guide`) and keeps English
 * under `/en` — without it, `/` 404s.
 *
 * It also issues the page's Content-Security-Policy around a per-request
 * nonce. The policy goes on the REQUEST too: Next.js reads the nonce from it
 * and stamps it on every script it renders (next-intl forwards the request
 * headers on its rewrites).
 *
 * Must live in `src/` because the app uses a `src` directory; a middleware file
 * at the package root is silently ignored.
 */
const intl = createMiddleware(routing);

const API_ORIGIN = originOf(
  process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8000"),
);
const HTTPS = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

export default function middleware(request: NextRequest) {
  const nonce = newNonce();
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    apiOrigin: API_ORIGIN,
    https: HTTPS,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const response = intl(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip API routes, Next internals, and any path with a file extension.
  // `\\.` is a literal dot: a single backslash would collapse to a plain `.`
  // and exclude nearly every route from the middleware.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
