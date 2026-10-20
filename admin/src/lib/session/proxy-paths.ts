/**
 * Which API paths the browser may reach through /api/proxy.
 *
 * Admin resources, plus a short list of exact non-admin operations the staff
 * screens need. `/admin/auth/*` is excluded because login and password
 * changes mint tokens, which must go through their own handlers so the pair
 * lands in cookies instead of in page JavaScript. Dot segments are refused so
 * an encoded `..` can never walk out of the allowed prefix.
 *
 * The stream ticket is deliberately NOT here: the notification stream is
 * proxied by /api/notifications/stream, which mints the ticket server-side,
 * so no ticket (let alone a token) ever reaches the browser.
 */

const UUID = "[0-9a-fA-F-]{36}";

/** Non-admin routes, each pinned to its method and exact shape. */
const EXTRA: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  // The staff member's own notification inbox (shared with their phone).
  { method: "GET", pattern: /^\/me\/notifications$/ },
  { method: "GET", pattern: /^\/me\/notifications\/unread-count$/ },
  { method: "PATCH", pattern: /^\/me\/notifications\/read-all$/ },
  { method: "PATCH", pattern: new RegExp(`^/me/notifications/${UUID}/read$`) },
  // Assigning a delivery agent lives outside /admin in the contract.
  { method: "PATCH", pattern: new RegExp(`^/deliveries/${UUID}/assign$`) },
  // So do the staff steps of a customer return (contract 17.0).
  { method: "POST", pattern: new RegExp(`^/returns/${UUID}/(approve|receive|inspect|refund)$`) },
];

export function isProxyablePath(path: string, method = "GET"): boolean {
  const segments = path.split("/").filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("%2E%2E") ||
        segment.includes("%2e%2e"),
    )
  ) {
    return false;
  }
  if (segments[0] === "admin") {
    return segments.length >= 2 && segments[1] !== "auth";
  }
  const upper = method.toUpperCase();
  return EXTRA.some(
    (entry) => entry.method === upper && entry.pattern.test(path),
  );
}

/** Downloads are the only generic proxy response that must stay byte-for-byte. */
export function isBinaryProxyPath(path: string, method = "GET"): boolean {
  return method.toUpperCase() === "GET" && new RegExp(`^/admin/reports/exports/${UUID}/download$`).test(path);
}
