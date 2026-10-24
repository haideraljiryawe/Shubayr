/**
 * A `?next=` value that is safe to send the browser back to: a path on this
 * site only. "//evil.example" and "/\\evil.example" are other sites to a
 * browser, so they are refused, as are the sign-in and password pages
 * themselves (going "back" there would loop). Anything else falls back.
 */
export function safeReturnPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  const path = next.split(/[?#]/)[0];
  if (path === "/login" || path === "/change-password") return fallback;
  return next;
}
