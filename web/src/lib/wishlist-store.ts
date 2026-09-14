/* ---------------------------------------------------------------------------
 * Wishlist.
 *
 * The same shape as the cart store, for the same reason: a framework-free
 * external store (no React import) so components, tests and the sync adapter
 * all read one source of truth.
 *
 * Contract seam: GET/POST /wishlist and DELETE /wishlist/{productId}. A guest
 * has no server wishlist, so hearts are kept in localStorage and replayed onto
 * the account the first time the shopper signs in — `setWishlistSync` is the
 * single place that plugs the real endpoints in, exactly as the cart does.
 * ------------------------------------------------------------------------- */

export const WISHLIST_STORAGE_KEY = "shubayr.wishlist.v1";

/** Phase 4 wrote a bare id array under this key; read it once, then retire it. */
const LEGACY_STORAGE_KEY = "shubayr:wishlist";

export interface WishlistState {
  /** Product ids, newest first — the order the wishlist page renders. */
  ids: string[];
  /**
   * False until localStorage has been read. The page shows a skeleton rather
   * than an empty state it would immediately have to replace.
   */
  hydrated: boolean;
}

const EMPTY_IDS: string[] = [];

const EMPTY_STATE: WishlistState = Object.freeze({
  ids: EMPTY_IDS,
  hydrated: false,
});

/**
 * Mirrors mutations onto the authenticated /wishlist endpoints. Installed once
 * a customer signs in; for a guest this stays null and the list is local-only.
 */
export interface WishlistSync {
  add(productId: string): Promise<void>;
  remove(productId: string): Promise<void>;
}

let sync: WishlistSync | null = null;

export function setWishlistSync(next: WishlistSync | null): void {
  sync = next;
}

/** Sync is best-effort: local state stays authoritative for the current tab. */
function push(run: (adapter: WishlistSync) => Promise<void>): void {
  if (!sync) return;
  run(sync).catch(() => {
    /* Offline or unauthenticated — the local wishlist is still correct. */
  });
}

let state: WishlistState = EMPTY_STATE;
/**
 * Bumped on every local change. The sign-in merge captures it before fetching
 * and refuses to apply a response that the shopper has already overtaken —
 * without this, removing an item just after landing on the page lets the
 * in-flight GET /wishlist put it straight back.
 */
let revision = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* Private mode or a full quota: the wishlist still works for this session. */
  }
}

function setIds(ids: string[], { save = true, local = true } = {}): void {
  state = { ids, hydrated: true };
  if (local) revision += 1;
  if (save) persist(ids);
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

function readStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (raw !== null) return parseIds(raw);
    // First run after the upgrade: adopt the Phase 4 list, then write it
    // forward under the new key so this branch is taken exactly once.
    const legacy = parseIds(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy.length > 0) persist(legacy);
    return legacy;
  } catch {
    return [];
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== WISHLIST_STORAGE_KEY && event.key !== null) return;
  state = { ids: parseIds(event.newValue), hydrated: true };
  emit();
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
   * The server renders no guest wishlist, so the hydration pass sees the empty
   * one and the markup matches the SSR output; the real list is adopted in the
   * same commit, so no heart flashes the wrong way.
   */
  getServerSnapshot(): WishlistState {
    return EMPTY_STATE;
  },

  /** Read persisted ids. Safe to call repeatedly; only the first run reads. */
  hydrate(): void {
    if (state.hydrated) return;
    setIds(readStorage(), { save: false, local: false });
  },

  /** Snapshot of the local-edit counter, for adoptRemote's staleness check. */
  revision(): number {
    return revision;
  },

  has(productId: string): boolean {
    return state.ids.includes(productId);
  },

  add(productId: string): void {
    if (state.ids.includes(productId)) return;
    setIds([productId, ...state.ids]);
    push((adapter) => adapter.add(productId));
  },

  remove(productId: string): void {
    if (!state.ids.includes(productId)) return;
    setIds(state.ids.filter((id) => id !== productId));
    push((adapter) => adapter.remove(productId));
  },

  /** Returns the state the heart should now show. */
  toggle(productId: string): boolean {
    const next = !state.ids.includes(productId);
    if (next) wishlistStore.add(productId);
    else wishlistStore.remove(productId);
    return next;
  },

  /**
   * Merge the server's wishlist in at sign-in.
   *
   * Anything the shopper hearted as a guest is pushed up rather than dropped —
   * losing a saved product because someone signed in afterwards would be the
   * worst possible moment to lose it. The union is kept locally too, so the
   * list is right immediately instead of after the next fetch.
   */
  adoptRemote(remoteIds: string[], since?: number): void {
    // Read storage first. Signing in is a full page load, so module state may
    // still be empty here even though the device holds guest picks — merging
    // against that empty state would silently delete them.
    wishlistStore.hydrate();

    // The shopper edited the list while the fetch was in flight. Those edits
    // were already pushed to the server, so it will converge on its own;
    // applying this stale response would undo them in front of them.
    if (since !== undefined && since !== revision) return;

    const localOnly = state.ids.filter((id) => !remoteIds.includes(id));
    setIds([...localOnly, ...remoteIds]);
    for (const id of localOnly) push((adapter) => adapter.add(id));
  },

  /** Drop the signed-in list on sign-out, leaving nothing behind on the device. */
  clear(): void {
    setIds([]);
  },
};
