import { ApiError, api, type WishlistItem } from "./api";

/* ---------------------------------------------------------------------------
 * The wishlist, in two modes — the same split the cart makes.
 *
 * Signed out, it is a guest list in localStorage: the contract has no server
 * wishlist for someone without an account, so the browser holds the ids.
 *
 * Signed in, the SERVER list is the authority. GET /wishlist returns each row
 * with its whole product, priced by the server at read time, and that is what
 * the wishlist page renders — nothing here recomputes a price. Hearts toggle
 * optimistically and are reconciled with the server's answer.
 *
 * Signing in replays the guest picks through POST /wishlist EXACTLY ONCE:
 * each id leaves the guest list the moment the server has answered for it, so
 * neither a second mount (React StrictMode runs effects twice), a reload, nor
 * a later sign-in can push it again — which matters, because a replay that
 * repeated would quietly re-add a product the shopper removed on another
 * device.
 * ------------------------------------------------------------------------- */

export const WISHLIST_STORAGE_KEY = "shubayr.wishlist.v1";

/** Phase 4 wrote a bare id array under this key; read it once, then retire it. */
const LEGACY_STORAGE_KEY = "shubayr:wishlist";

export type WishlistStatus =
  /** Signed out: `ids` is the device's guest list. */
  | "guest"
  /** Signed in; the guest replay and first GET /wishlist are in flight. */
  | "loading"
  /** Signed in, and `items` is the server's list. */
  | "ready"
  /** Signed in, but the server list could not be read. */
  | "error";

export interface WishlistState {
  /** Product ids, newest first — what every heart and the page read. */
  ids: string[];
  /**
   * The server's rows by product id while signed in, each carrying the product
   * exactly as GET /wishlist priced it. Empty for a guest.
   */
  items: Readonly<Record<string, WishlistItem>>;
  status: WishlistStatus;
  /**
   * False until localStorage has been read. The page shows a skeleton rather
   * than an empty state it would immediately have to replace.
   */
  hydrated: boolean;
}

const EMPTY_IDS: string[] = [];
const EMPTY_ITEMS: Readonly<Record<string, WishlistItem>> = Object.freeze({});

const EMPTY_STATE: WishlistState = Object.freeze({
  ids: EMPTY_IDS,
  items: EMPTY_ITEMS,
  status: "guest",
  hydrated: false,
});

let state: WishlistState = EMPTY_STATE;
const listeners = new Set<() => void>();

/**
 * Bumped on every sign-in and sign-out. Anything asynchronous captures it and
 * drops its result if the session changed underneath — a GET that lands after
 * sign-out must not paint one account's list onto a signed-out device.
 */
let epoch = 0;

/** Bumped on every signed-in heart, so a stale GET cannot undo a fresh tap. */
let revision = 0;

/** The in-flight sign-in, shared by every caller — the StrictMode guard. */
let attaching: Promise<void> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<WishlistState>): void {
  state = { ...state, ...patch, hydrated: true };
  emit();
}

function parseIds(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    // De-duplicate: a hand-edited or double-written entry must not render twice.
    return [...new Set(parsed.filter((id): id is string => typeof id === "string"))];
  } catch {
    return [];
  }
}

/**
 * Only the guest list is ever persisted. The signed-in list lives on the
 * account and is refetched, so none of it is left behind on the device.
 */
function writeGuestIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* Private mode or a full quota: the wishlist still works for this session. */
  }
}

function readGuestIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (raw !== null) return parseIds(raw);
    // First run after the upgrade: adopt the Phase 4 list, then write it
    // forward under the new key so this branch is taken exactly once.
    const legacy = parseIds(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy.length > 0) writeGuestIds(legacy);
    return legacy;
  } catch {
    return [];
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== WISHLIST_STORAGE_KEY && event.key !== null) return;
  // Another tab's guest hearts. A signed-in tab reads the server instead.
  if (state.status !== "guest") return;
  setState({ ids: parseIds(event.newValue) });
}

function byProductId(rows: WishlistItem[]): Record<string, WishlistItem> {
  const items: Record<string, WishlistItem> = {};
  for (const row of rows) if (row.product_id) items[row.product_id] = row;
  return items;
}

function without(
  items: Readonly<Record<string, WishlistItem>>,
  productId: string,
): Record<string, WishlistItem> {
  const next = { ...items };
  delete next[productId];
  return next;
}

/**
 * A replayed pick the server will never take: the product left the catalogue
 * (404) or the id is not one it recognises (422, e.g. a fixture id saved while
 * the catalogue was mocked). Retrying those forever would pin them to the
 * device, so they are dropped. Anything else — offline, a 5xx, an expired
 * session — keeps the pick for the next sign-in.
 */
function isPermanentRejection(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 422)
  );
}

async function attach(session: number): Promise<void> {
  const guest = readGuestIds();
  setState({ status: "loading", ids: guest, items: EMPTY_ITEMS });

  // Oldest pick first, so the newest guest heart also ends up newest on the
  // account. Each id leaves the guest list as soon as the server has answered
  // for it — there is no moment at which a pick is both on the account and
  // still queued for another replay.
  let remaining = guest;
  for (const productId of [...guest].reverse()) {
    if (session !== epoch) return;
    try {
      await api.addWishlistItem(productId);
    } catch (error) {
      if (!isPermanentRejection(error)) break;
    }
    remaining = remaining.filter((id) => id !== productId);
    writeGuestIds(remaining);
  }

  await load(session);
}

/** Read the server list, reading once more if a heart was tapped mid-flight. */
async function load(session: number): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const since = revision;
    let rows: WishlistItem[];
    try {
      rows = await api.listWishlist();
    } catch {
      if (session === epoch) setState({ status: "error" });
      return;
    }
    if (session !== epoch) return;
    // A tap landed while this read was in flight, and its request may have
    // reached the server after the read did — so this answer could predate it.
    if (since !== revision && attempt === 0) continue;

    setState({
      status: "ready",
      ids: rows.map((row) => row.product_id ?? "").filter(Boolean),
      items: byProductId(rows),
    });
    return;
  }
}

async function addOnServer(productId: string): Promise<void> {
  const session = epoch;
  revision += 1;
  setState({ ids: [productId, ...state.ids] });
  try {
    const row = await api.addWishlistItem(productId);
    if (session !== epoch) return;
    // The server's row carries the product as priced right now, so the page
    // renders it without a second fetch.
    setState({ items: { ...state.items, [productId]: row } });
  } catch {
    if (session !== epoch) return;
    // The heart goes back off rather than claiming a save that did not happen.
    setState({
      ids: state.ids.filter((id) => id !== productId),
      items: without(state.items, productId),
    });
  }
}

async function removeFromServer(productId: string): Promise<void> {
  const session = epoch;
  revision += 1;
  setState({
    ids: state.ids.filter((id) => id !== productId),
    items: without(state.items, productId),
  });
  try {
    await api.removeWishlistItem(productId);
  } catch (error) {
    // 404 means it is already gone — removed on another device — which is
    // exactly the state the shopper asked for.
    if (error instanceof ApiError && error.status === 404) return;
    // Anything else: the server may still hold it, so ask rather than guess.
    if (session === epoch) await load(session);
  }
}

export const wishlistStore = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  },

  getSnapshot(): WishlistState {
    return state;
  },

  /**
   * The server renders no wishlist, so the hydration pass sees the empty one
   * and the markup matches the SSR output; the real list is adopted in the
   * same commit, so no heart flashes the wrong way.
   */
  getServerSnapshot(): WishlistState {
    return EMPTY_STATE;
  },

  /** Read the guest list. Safe to call repeatedly; only the first run reads. */
  hydrate(): void {
    if (state.hydrated) return;
    setState({ ids: readGuestIds() });
  },

  has(productId: string): boolean {
    return state.ids.includes(productId);
  },

  add(productId: string): void {
    if (state.ids.includes(productId)) return;
    if (state.status !== "guest") {
      void addOnServer(productId);
      return;
    }
    const ids = [productId, ...state.ids];
    writeGuestIds(ids);
    setState({ ids });
  },

  remove(productId: string): void {
    if (!state.ids.includes(productId)) return;
    if (state.status !== "guest") {
      void removeFromServer(productId);
      return;
    }
    const ids = state.ids.filter((id) => id !== productId);
    writeGuestIds(ids);
    setState({ ids });
  },

  /** Returns the state the heart should now show. */
  toggle(productId: string): boolean {
    const next = !state.ids.includes(productId);
    if (next) wishlistStore.add(productId);
    else wishlistStore.remove(productId);
    return next;
  },

  /**
   * Switch to the account's list at sign-in, replaying the guest picks once.
   *
   * Every caller shares one in-flight attach: React runs mount effects twice
   * in development StrictMode, and the second run must join the first rather
   * than start a replay of its own. Once attached, calling again is a no-op.
   */
  attachAccount(): Promise<void> {
    if (attaching) return attaching;
    if (state.status !== "guest") return Promise.resolve();
    const run: Promise<void> = attach(epoch).finally(() => {
      // A sign-out (and perhaps a fresh sign-in) may have replaced it already.
      if (attaching === run) attaching = null;
    });
    attaching = run;
    return run;
  },

  /** Re-read the server list — the page's retry after a failed load. */
  async refresh(): Promise<void> {
    if (state.status === "guest") return;
    setState({ status: "loading" });
    await load(epoch);
  },

  /**
   * Back to the device's guest list on sign-out. The account's list is not
   * kept on the device: the next person to use it must not see it.
   */
  detachAccount(): void {
    if (state.status === "guest" && state.hydrated) return;
    epoch += 1;
    attaching = null;
    setState({ status: "guest", ids: readGuestIds(), items: EMPTY_ITEMS });
  },
};
