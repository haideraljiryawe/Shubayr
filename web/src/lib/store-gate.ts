/* ---------------------------------------------------------------------------
 * "Opening soon" mode: the store before it opens to customers.
 *
 * STORE_PUBLIC=false (server environment, read at run time — not baked into
 * the build) puts every store page behind a branded "opening soon" page that
 * search engines are told not to index. The API and the Web Admin are separate
 * servers and keep working; the store's own /api routes (health) are outside
 * the gate.
 *
 * The owner previews the real store through a secret link:
 *
 *   https://store.example/preview?t=<STORE_PREVIEW_TOKEN>
 *
 * which sets an httpOnly cookie for 30 days (the token's hash, never the token
 * itself) and opens the home page; /preview?exit=1 ends the preview. Without
 * a token of at least 16 characters there is no preview at all. Unset or any
 * other value of STORE_PUBLIC means the store is open, as before.
 *
 * While the store is closed every page response is `private, no-store`, so a
 * shared cache can never hand a previewed page to the public.
 * ------------------------------------------------------------------------- */

export const PREVIEW_COOKIE = "shubayr_store_preview";
export const PREVIEW_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Set by the proxy on the request (never trusted from the client): "closed" or "preview". */
export const GATE_HEADER = "x-store-gate";
export const COMING_SOON_SEGMENT = "coming-soon";

export type StoreGate = "closed" | "preview";

/** Whether the store is open to everyone. Only an explicit "false" (or 0/no/off) closes it. */
export function storeIsPublic(raw: string | undefined = process.env.STORE_PUBLIC): boolean {
  return !/^(false|0|no|off)$/i.test((raw ?? "").trim());
}

/** The preview secret, or null when previews are off (unset or shorter than 16 characters). */
export function previewToken(raw: string | undefined = process.env.STORE_PREVIEW_TOKEN): string | null {
  const token = (raw ?? "").trim();
  return token.length >= 16 ? token : null;
}

/** The cookie value for a token: a SHA-256 of it, so the cookie never carries the secret. */
export async function previewDigest(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`shubayr-store-preview:${token}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare two strings without stopping at the first difference. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

/** The locale a public path is in: English under /en, Arabic everywhere else. */
export function localeOfPath(pathname: string): "ar" | "en" {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "ar";
}

/** The path without its locale prefix: "/en/preview" → "/preview". */
export function unprefixed(pathname: string): string {
  if (pathname === "/en") return "/";
  return pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
}
