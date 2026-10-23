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

/** A transient API/network failure is not proof that a session ended. */
export class RefreshUnavailableError extends Error {
  constructor() {
    super("The authentication service is temporarily unavailable");
    this.name = "RefreshUnavailableError";
  }
}

function prune(now: number): void {
  for (const [key, entry] of inflight) {
    if (now - entry.at > REMEMBER_MS) inflight.delete(key);
  }
}

async function callRefresh(
  refreshToken: string,
  fetcher: typeof fetch,
  forwarded: Record<string, string>,
): Promise<TokenPair | null> {
  try {
    const response = await fetcher(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwarded },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const pair = (await response.json()) as Partial<TokenPair>;
    return pair.access_token && pair.refresh_token
      ? { access_token: pair.access_token, refresh_token: pair.refresh_token }
      : null;
  } catch {
    throw new RefreshUnavailableError();
  }
}

export function refreshSession(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
  /** The client's forwarded-address headers (clientForwardHeaders). */
  forwarded: Record<string, string> = {},
): Promise<TokenPair | null> {
  const now = Date.now();
  prune(now);
  const existing = inflight.get(refreshToken);
  if (existing) return existing.promise;
  const promise = callRefresh(refreshToken, fetcher, forwarded);
  inflight.set(refreshToken, { promise, at: now });
  // A refused or unavailable refresh is not worth remembering: let the next
  // request retry. Successful rotations stay briefly so late requests in this
  // process receive the same pair.
  void promise.then(
    (pair) => {
      if (!pair) inflight.delete(refreshToken);
    },
    () => inflight.delete(refreshToken),
  );
  return promise;
}

/** Test hook. */
export function __resetRefreshCache(): void {
  inflight.clear();
}
