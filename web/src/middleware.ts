import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Resolves the locale for every request. With `localePrefix: "as-needed"` this
 * is what serves Arabic at the bare path (`/`, `/style-guide`) and keeps English
 * under `/en` — without it, `/` 404s.
 *
 * Must live in `src/` because the app uses a `src` directory; a middleware file
 * at the package root is silently ignored.
 */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, and any path with a file extension.
  // `\\.` is a literal dot: a single backslash would collapse to a plain `.`
  // and exclude nearly every route from the middleware.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
