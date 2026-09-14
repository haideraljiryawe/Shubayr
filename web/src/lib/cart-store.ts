/* ---------------------------------------------------------------------------
 * Guest cart.
 *
 * A framework-free external store (no React import), so the same state can be
 * read by components, tests and — in the account phase — a sync adapter that
 * mirrors every mutation onto the authenticated cart endpoints.
 *
 * Contract seam: the shared cart is GET /cart + POST/PATCH/DELETE /cart/items.
 * Until a customer can sign in there is nobody to own a server cart, so the
 * guest cart lives in localStorage. `setCartSync` is the single place the
 * account phase plugs the real endpoints in; nothing else in the UI changes.
 *
 * Each line carries everything a row needs to render — name, image, variant
 * label, price — so the cart page never re-fetches the catalogue to show what
 * the shopper already chose.
 * ------------------------------------------------------------------------- */

export const CART_STORAGE_KEY = "shubayr.cart.v1";

export interface CartLine {
  /** `productId::variantId` — stable across reloads, unlike a server row id. */
  id: string;
  product_id: string;
  variant_id: string | null;
  name_ar: string;
  name_en: string;
  image_url: string | null;
  /** Rendered under the name, e.g. «أسود» or «40». */
  variant_label: string | null;
  unit_price: number;
  /** Pre-discount price, for the struck-through original on the row. */
  compare_at_price: number | null;
  /** Sellable stock when the line was added; caps the stepper. */
  available_qty: number;
  quantity: number;
}

/** Everything about a line except its identity and how many were chosen. */
export type CartLineInput = Omit<CartLine, "id" | "quantity">;

/** A validated coupon, narrowed from the contract's optional-everything shape. */
export interface AppliedCoupon {
  code: string;
  type: "percentage" | "fixed";
  value: number;
}

export interface CartState {
  lines: CartLine[];
  coupon: AppliedCoupon | null;
  /**
   * False until localStorage has been read. Components use it to show a
   * skeleton instead of an empty cart they would immediately have to replace.
   */
  hydrated: boolean;
}

export function lineId(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

const EMPTY_LINES: CartLine[] = [];

const EMPTY_STATE: CartState = Object.freeze({
  lines: EMPTY_LINES,
  coupon: null,
  hydrated: false,
});

/**
 * Mirrors mutations onto the authenticated /cart endpoints. The account phase
 * installs an implementation once a customer can sign in; until then the guest
 * cart is local-only and this stays null.
 */
export interface CartSync {
  add(line: CartLine): Promise<void>;
  update(line: CartLine): Promise<void>;
  remove(line: CartLine): Promise<void>;
  clear(): Promise<void>;
}

let sync: CartSync | null = null;

export function setCartSync(next: CartSync | null): void {
  sync = next;
}

/** Sync is best-effort: local state stays authoritative for a guest. */
function push(run: (adapter: CartSync) => Promise<void>): void {
  if (!sync) return;
  run(sync).catch(() => {
    /* Offline or unauthenticated — the local cart is still correct. */
  });
}

let state: CartState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(next: CartState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ lines: next.lines, coupon: next.coupon }),
    );
  } catch {
    /* Private mode or a full quota: the cart still works for this session. */
  }
}

function setState(next: CartState, { save = true } = {}): void {
  state = next;
  if (save) persist(next);
  emit();
}

function isLine(value: unknown): value is CartLine {
  const line = value as Partial<CartLine> | null;
  return (
    !!line &&
    typeof line.id === "string" &&
    typeof line.product_id === "string" &&
    typeof line.unit_price === "number" &&
    typeof line.quantity === "number" &&
    line.quantity > 0
  );
}

function isCoupon(value: unknown): value is AppliedCoupon {
  const coupon = value as Partial<AppliedCoupon> | null;
  return (
    !!coupon &&
    typeof coupon.code === "string" &&
    (coupon.type === "percentage" || coupon.type === "fixed") &&
    typeof coupon.value === "number"
  );
}

/** Never trust a stored quantity to still sit within the line's stock cap. */
function clampLine(line: CartLine): CartLine {
  const max = Math.max(0, line.available_qty ?? 0);
  const quantity = max > 0 ? Math.min(line.quantity, max) : line.quantity;
  return quantity === line.quantity ? line : { ...line, quantity };
}

/**
 * Read persisted state. Anything unparseable is discarded rather than thrown: a
 * stale or hand-edited entry must not be able to break the storefront.
 */
function readStorage(): Omit<CartState, "hydrated"> {
  if (typeof window === "undefined") return { lines: [], coupon: null };
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return { lines: [], coupon: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter(isLine).map(clampLine)
      : [];
    return { lines, coupon: isCoupon(parsed.coupon) ? parsed.coupon : null };
  } catch {
    return { lines: [], coupon: null };
  }
}

export const cartStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): CartState {
    return state;
  },

  /**
   * The server has no guest cart, so it renders the empty one.
   * useSyncExternalStore uses this for the hydration pass, which is what keeps
   * the markup identical to the SSR output; the real snapshot is adopted in the
   * same commit, so the badge never flashes a wrong number.
   */
  getServerSnapshot(): CartState {
    return EMPTY_STATE;
  },

  /**
   * Add `quantity` of an item, merging into the existing line for the same
   * product+variant. The result is capped at the item's available quantity, so
   * a shopper can never hold more than the stock the contract reported.
   * Returns the quantity held after the add (0 when the item is sold out).
   */
  addItem(input: CartLineInput, quantity = 1): number {
    const id = lineId(input.product_id, input.variant_id);
    const existing = state.lines.find((line) => line.id === id);
    const cap = Math.max(0, input.available_qty);
    if (cap <= 0) return 0;

    const next = Math.min(
      cap,
      (existing?.quantity ?? 0) + Math.max(1, quantity),
    );
    // Re-spreading `input` refreshes price and stock from the page the shopper
    // is looking at now, which is newer than whatever the line was added with.
    const line: CartLine = { ...(existing ?? {}), ...input, id, quantity: next };

    setState({
      ...state,
      lines: existing
        ? state.lines.map((item) => (item.id === id ? line : item))
        : [...state.lines, line],
    });

    push((adapter) => (existing ? adapter.update(line) : adapter.add(line)));
    return next;
  },

  /** Set an exact quantity; 0 or less removes the line. */
  setQuantity(id: string, quantity: number): void {
    const existing = state.lines.find((line) => line.id === id);
    if (!existing) return;
    if (quantity <= 0) {
      cartStore.removeItem(id);
      return;
    }

    const line = clampLine({ ...existing, quantity });
    if (line.quantity === existing.quantity) return;

    setState({
      ...state,
      lines: state.lines.map((item) => (item.id === id ? line : item)),
    });
    push((adapter) => adapter.update(line));
  },

  removeItem(id: string): void {
    const existing = state.lines.find((line) => line.id === id);
    if (!existing) return;

    const lines = state.lines.filter((line) => line.id !== id);
    // An emptied cart drops the coupon with it: it was validated against a
    // basket that no longer exists.
    setState({ ...state, lines, coupon: lines.length ? state.coupon : null });
    push((adapter) => adapter.remove(existing));
  },

  clear(): void {
    setState({ ...state, lines: [], coupon: null });
    push((adapter) => adapter.clear());
  },

  applyCoupon(coupon: AppliedCoupon): void {
    setState({ ...state, coupon });
  },

  removeCoupon(): void {
    setState({ ...state, coupon: null });
  },
};

if (typeof window !== "undefined") {
  // Runs when the client bundle loads — before React hydrates — so the first
  // post-hydration render already has the persisted cart.
  setState({ ...readStorage(), hydrated: true }, { save: false });

  // A second tab that checks out must not leave this one showing a stale
  // basket. `key === null` is a whole-storage clear.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
    setState({ ...readStorage(), hydrated: true }, { save: false });
  });
}
