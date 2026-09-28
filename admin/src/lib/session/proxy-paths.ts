/**
 * Which API paths the browser may reach through /api/proxy.
 *
 * Admin resources only. `/admin/auth/*` is excluded because login and
 * password changes mint tokens, which must go through their own handlers so
 * the pair lands in cookies instead of in page JavaScript. Dot segments are
 * refused so an encoded `..` can never walk out of the allowed prefix.
 */
export function isProxyablePath(path: string): boolean {
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
  if (segments[0] !== "admin" || segments.length < 2) return false;
  return segments[1] !== "auth";
}
