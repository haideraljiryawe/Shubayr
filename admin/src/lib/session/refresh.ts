import { API_URL } from "../config";
import type { TokenPair } from "./tokens";

/* ---------------------------------------------------------------------------
 * Refresh, de-duplicated.
 *
 * The API rotates refresh tokens: each one is single-use. A page load fans out
 * into several requests at once (the document, prefetches, the session poll),
 * and if each of them refreshed with the same token only the first would win
 * — the rest would be refused and sign the user out. So the refresh for a
 * given token runs once, and its result is remembered briefly for any request
 * that still carries the old token. This is per server process; a
 * multi-instance deployment needs sticky sessions or a shared cache here.
 * ------------------------------------------------------------------------- */

const REMEMBER_MS = 60_000;

interface Entry {
  promise: Promise<TokenPair | null>;
  at: number;
}

const inflight = new Map<string, Entry>();

function prune(now: number): void {
  for (const [key, entry] of inflight) {
    if (now - entry.at > REMEMBER_MS) inflight.delete(key);
  }
}

async function callRefresh(
  refreshToken: string,
  fetcher: typeof fetch,
): Promise<TokenPair | null> {
  try {
    const response = await fetcher(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const pair = (await response.json()) as Partial<TokenPair>;
    return pair.access_token && pair.refresh_token
      ? { access_token: pair.access_token, refresh_token: pair.refresh_token }
      : null;
  } catch {
    return null;
  }
}

export function refreshSession(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<TokenPair | null> {
  const now = Date.now();
  prune(now);
  const existing = inflight.get(refreshToken);
  if (existing) return existing.promise;
  const promise = callRefresh(refreshToken, fetcher);
  inflight.set(refreshToken, { promise, at: now });
  // A failed refresh is not worth remembering: let the next caller retry.
  void promise.then((pair) => {
    if (!pair) inflight.delete(refreshToken);
  });
  return promise;
}

/** Test hook. */
export function __resetRefreshCache(): void {
  inflight.clear();
}
