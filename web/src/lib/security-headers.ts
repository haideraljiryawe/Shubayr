/* ---------------------------------------------------------------------------
 * Security headers for the storefront.
 *
 * The Content-Security-Policy is built per request in the middleware, around
 * a fresh nonce: Next.js reads the nonce back from the request's CSP header
 * and puts it on every script it renders, so no inline script runs without
 * it ('strict-dynamic' then trusts what those scripts load). Styles keep
 * 'unsafe-inline' — the white-label brand colour is an inline <style> — but
 * scripts never do. The other headers are static and set in next.config.ts.
 * ------------------------------------------------------------------------- */

export function newNonce(): string {
  // Edge-safe: no Buffer in middleware.
  return btoa(crypto.randomUUID());
}

/** The origin of an absolute URL, or null when it isn't one. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(options: {
  nonce: string;
  /** Development needs eval (React's dev tooling) and the HMR socket. */
  dev: boolean;
  /** The API the browser calls directly (catalog, cart, the inbox stream). */
  apiOrigin: string | null;
  /** Upgrade subresources to https (only when the site itself is https). */
  https: boolean;
}): string {
  const api = options.apiOrigin ? [options.apiOrigin] : [];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(options.dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Product imagery comes from the API's media route (object storage) or a
    // CDN; next/image serves most of it from this origin.
    ["img-src", ["'self'", "data:", "blob:", "https:", ...api]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...api, ...(options.dev ? ["ws:", "wss:"] : [])]],
    ["media-src", ["'self'", "https:", ...api]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    // The storefront may frame itself (nothing else may frame it).
    ["frame-ancestors", ["'self'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Headers that never change, for next.config.ts `headers()`. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
