/* ---------------------------------------------------------------------------
 * Security headers for the Web Admin.
 *
 * The Content-Security-Policy is built per request in the proxy around a
 * fresh nonce, which Next.js reads back from the request and stamps on every
 * script it renders — no inline script runs without it. The browser talks
 * only to this origin (the BFF), so connect-src is 'self'; product imagery may
 * come straight from the API's media route. Nothing may frame the admin.
 * The static headers are set in next.config.ts.
 * ------------------------------------------------------------------------- */

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(options: { nonce: string; dev: boolean; mediaOrigin: string | null; https: boolean }): string {
  const media = options.mediaOrigin ? [options.mediaOrigin] : [];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(options.dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:", ...media]],
    ["font-src", ["'self'", "data:"]],
    // The inbox stream and every API call go through this origin's BFF.
    ["connect-src", ["'self'", ...(options.dev ? ["ws:", "wss:"] : [])]],
    ["media-src", ["'self'", ...media]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // An admin must never leak its URLs to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Clickjacking: CSP frame-ancestors 'none', and the legacy header too.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // An internal tool: nothing here belongs in a search index.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
