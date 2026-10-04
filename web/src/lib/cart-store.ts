import { api, type Cart, type Product } from "./api";
import { roundQuantity } from "./quantity";

/* ---------------------------------------------------------------------------
 * The cart, in two modes.
 *
 * Signed out, it is a guest cart in localStorage: the contract has no server
 * cart for someone without an account, so the browser holds the lines.
 *
 * Signed in, the SERVER cart is the authority. Every mutation returns the
 * whole repriced cart and the store adopts it verbatim — prices, availability,
 * subtotal, coupon discount, delivery fee and total all come from the API, and
 * nothing here recomputes them. That is the point: the customer is charged
 * what the server says, so the screen must show the server's arithmetic rather
 * than its own guess at it.
 *
 * Signing in attaches every guest line in one idempotent POST /cart/merge.
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
  /**
   * What the shopper pays per unit, captured when the line was added: the
   * product's `effective_price` at that moment. A discount window closing
   * later never rewrites a line already in the cart.
   */
  unit_price: number;
  /** Regular price when the line was added on sale, for the struck original. */
  regular_price: number | null;
  /** Sellable stock when the line was added; caps the stepper. */
  available_qty: number;
  /**
   * The SKU's base unit ("piece", "kg"…) and whether it takes whole numbers
   * only. Absent on lines stored before catalog v2, which were all pieces.
   */
  base_unit?: string;
  whole_units_only?: boolean;
  /** In the SKU's base unit: whole for pieces, up to three decimals else. */
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
  /**
   * The guest cart, and — once signed in — the presentation cache. The server
   * sends ids, prices and availability but no names or artwork, so what this
   * device already knows about a product is kept here and joined onto the
   * server's lines for rendering.
   */
  lines: CartLine[];
  /** Guest-side coupon. Signed in, the server owns it (`server.coupon_code`). */
  coupon: AppliedCoupon | null;
  /**
   * False until localStorage has been read. Components use it to show a
   * skeleton instead of an empty cart they would immediately have to replace.
   */
  hydrated: boolean;
  /** The server's repriced cart. Non-null exactly while signed in. */
  server: Cart | null;
  /** True while a server mutation is in flight, so the UI can hold steady. */
  pending: boolean;
  /** Stable for one guest-basket snapshot, so a failed merge can be replayed. */
  mergeKey: string | null;
}

export function lineId(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

const EMPTY_LINES: CartLine[] = [];

const EMPTY_STATE: CartState = Object.freeze({
  lines: EMPTY_LINES,
  coupon: null,
  hydrated: false,
  server: null,
  pending: false,
  mergeKey: null,
});

let state: CartState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(next: CartState): void {
  if (typeof window === "undefined") return;
  try {
    // Only the device-side half is persisted; the server cart is refetched.
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        lines: next.lines,
        coupon: next.coupon,
        mergeKey: next.mergeKey,
      }),
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

/**
 * A stored row. Quantity 0 is valid and meaningful: it marks a line that has
 * already been replayed onto the server cart and is kept only as presentation
 * detail, so it is never replayed a second time.
 */
function isLine(value: unknown): value is CartLine {
  const line = value as Partial<CartLine> | null;
  return (
    !!line &&
    typeof line.id === "string" &&
    typeof line.product_id === "string" &&
    typeof line.unit_price === "number" &&
    typeof line.quantity === "number" &&
    line.quantity >= 0
  );
}

/** The lines that are actually in a guest's basket. */
function guestLines(lines: CartLine[]): CartLine[] {
  return lines.filter((line) => line.quantity > 0);
}

/**
 * Carts persisted before the pricing model changed carry `compare_at_price`.
 * The stored `unit_price` is still what the shopper agreed to pay, so the line
 * is kept as-is and only the struck-through price is read under its new name.
 */
function migrateLine(line: CartLine): CartLine {
  if (line.regular_price !== undefined) return line;
  const legacy = (line as { compare_at_price?: unknown }).compare_at_price;
  return {
    ...line,
    regular_price: typeof legacy === "number" ? legacy : null,
  };
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

type StoredCart = Pick<CartState, "lines" | "coupon" | "mergeKey">;

/**
 * Read persisted state. Anything unparseable is discarded rather than thrown: a
 * stale or hand-edited entry must not be able to break the storefront.
 */
function readStorage(): StoredCart {
  if (typeof window === "undefined")
    return { lines: [], coupon: null, mergeKey: null };
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return { lines: [], coupon: null, mergeKey: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter(isLine).map(migrateLine).map(clampLine)
      : [];
    return {
      lines,
      coupon: isCoupon(parsed.coupon) ? parsed.coupon : null,
      mergeKey: typeof parsed.mergeKey === "string" ? parsed.mergeKey : null,
    };
  } catch {
    return { lines: [], coupon: null, mergeKey: null };
  }
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The server row for a product/variant, when the cart is server-backed. */
function serverItemFor(
  product_id: string,
  variant_id: string | null,
): NonNullable<Cart["items"]>[number] | undefined {
  return (state.server?.items ?? []).find(
    (item) =>
      item.product_id === product_id &&
      (item.variant_id ?? null) === (variant_id ?? null),
  );
}

/** Remember what a line looks like, so a server row can be rendered. */
function rememberLine(input: CartLineInput): CartLine[] {
  const id = lineId(input.product_id, input.variant_id);
  const existing = state.lines.find((line) => line.id === id);
  const line: CartLine = {
    ...(existing ?? { quantity: 1 }),
    ...input,
    id,
    quantity: existing?.quantity ?? 1,
  };
  return existing
    ? state.lines.map((item) => (item.id === id ? line : item))
    : [...state.lines, line];
}

/** Guards the sign-in replay so it can never run twice concurrently. */
let attaching: Promise<void> | null = null;

async function withPending<T>(run: () => Promise<T>): Promise<T> {
  setState({ ...state, pending: true }, { save: false });
  try {
    return await run();
  } finally {
    setState({ ...state, pending: false }, { save: false });
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

  /** True while the server cart is the authority. */
  isServerBacked(): boolean {
    return state.server !== null;
  },

  /**
   * Adopt the server cart at sign-in, atomically merging whatever the guest built.
   *
   * POST /cart/merge carries one stable key for the whole basket. Guest lines
   * are cleared only once the merge has landed, so a
   * failure mid-way leaves the basket on the device rather than losing it.
   */
  async attachServerCart(isCancelled: () => boolean = () => false): Promise<void> {
    // React invokes effects twice in development StrictMode. Without this the
    // guest basket is replayed onto the server twice and every quantity
    // doubles, which is a real bug the moment a retry happens in production.
    if (attaching) return attaching;
    attaching = cartStore.__attach(isCancelled).finally(() => {
      attaching = null;
    });
    return attaching;
  },

  /** @internal — always reached through `attachServerCart`. */
  async __attach(isCancelled: () => boolean): Promise<void> {
    await withPending(async () => {
      try {
        let cart = await api.getCart();
        if (isCancelled()) return;

        const guest = guestLines(state.lines);
        const mergeKey = state.mergeKey ?? idempotencyKey();
        // Make the server authoritative before merging. A click arriving while
        // the merge is in flight is then a separate, idempotent server add; the
        // cart row lock serializes both operations without losing either one.
        setState({ ...state, server: cart, mergeKey });
        if (guest.length > 0) {
          cart = await api.mergeCart(
            guest.map((line) => ({
            product_id: line.product_id,
            variant_id: line.variant_id,
            quantity: line.quantity,
            })),
            mergeKey,
          );
        }

        // Read the guest coupon BEFORE the state that holds it is replaced:
        // `setState` reassigns the module-level `state`, so looking it up
        // afterwards would always find the null this very call just wrote.
        const guestCouponCode = state.coupon?.code;

        setState({
          ...state,
          // The basket now lives on the server. The rows stay behind at
          // quantity 0 purely as presentation detail — that is what stops a
          // later mount from replaying them and doubling every quantity.
          lines: state.lines.map((line) => ({ ...line, quantity: 0 })),
          // The device coupon is dropped because the server decides which
          // coupon is on the cart.
          coupon: null,
          server: cart,
          mergeKey: null,
        });

        // A coupon the guest had applied is re-offered to the server, which
        // re-validates it against the merged basket.
        if (guestCouponCode) {
          await cartStore.applyCouponCode(guestCouponCode).catch(() => undefined);
        }
      } catch {
        // Offline or a failing cart endpoint: stay on the device cart rather
        // than showing an empty one to someone who has items.
        if (!isCancelled()) setState({ ...state, server: null }, { save: false });
      }
    });
  },

  /** Drop the server view on sign-out; the device keeps whatever it holds. */
  detachServerCart(): void {
    if (state.server === null) return;
    setState({ ...state, server: null }, { save: false });
  },

  /** Refetch the server cart — after placing an order, or on demand. */
  async refresh(): Promise<void> {
    if (state.server === null) return;
    try {
      const cart = await api.getCart();
      setState({ ...state, server: cart }, { save: false });
    } catch {
      /* Keep the last known cart rather than blanking it. */
    }
  },

  /**
   * Cache a product's display details for server lines this device lacks —
   * one row for the product and one per SKU, so a variant line also knows its
   * unit and whether it takes whole numbers only.
   */
  rememberProduct(product: Product): void {
    const productId = product.id;
    if (!productId) return;
    const known = new Set(state.lines.map((line) => line.id));
    const base: Omit<CartLine, "id" | "variant_id"> = {
      product_id: productId,
      name_ar: product.name_ar ?? "",
      name_en: product.name_en ?? "",
      image_url: product.images?.[0]?.url ?? null,
      variant_label: null,
      unit_price: product.effective_price ?? product.price ?? 0,
      regular_price: product.on_sale ? (product.price ?? null) : null,
      available_qty: product.available_qty ?? 0,
      quantity: 0,
    };
    const additions: CartLine[] = [];
    if (!known.has(lineId(productId, null))) {
      additions.push({ ...base, id: lineId(productId, null), variant_id: null });
    }
    for (const variant of product.variants ?? []) {
      if (!variant.id || known.has(lineId(productId, variant.id))) continue;
      const label = Object.entries(variant.attributes ?? {})
        .filter(([key, value]) => typeof value === "string" && !key.includes("_"))
        .map(([, value]) => value as string)
        .join(" · ");
      additions.push({
        ...base,
        id: lineId(productId, variant.id),
        variant_id: variant.id,
        variant_label: label || null,
        unit_price: variant.effective_price ?? base.unit_price,
        available_qty: variant.available_qty ?? 0,
        base_unit: variant.base_unit,
        whole_units_only: variant.whole_units_only,
      });
    }
    if (additions.length === 0) return;
    setState({ ...state, lines: [...state.lines, ...additions] });
  },

  /**
   * Add `quantity` of an item, merging into the existing line for the same
   * product+variant.
   *
   * Server-backed, the response decides what the cart now holds — including
   * refusing more than stock allows. Guest-side, the local cap does that job.
   */
  async addItem(input: CartLineInput, quantity = 1): Promise<void> {
    const lines = rememberLine(input);

    if (state.server) {
      await withPending(async () => {
        const cart = await api.addCartItem({
          product_id: input.product_id,
          variant_id: input.variant_id,
          quantity: quantity > 0 ? roundQuantity(quantity) : 1,
          idempotency_key: idempotencyKey(),
        });
        // The server holds the quantity; the device keeps only presentation
        // detail, at quantity 0 — the marker that stops the next sign-in
        // replay from adding this line to the server cart a second time.
        const id = lineId(input.product_id, input.variant_id);
        setState({
          ...state,
          lines: lines.map((line) =>
            line.id === id ? { ...line, quantity: 0 } : line,
          ),
          server: cart,
        });
      });
      return;
    }

    const id = lineId(input.product_id, input.variant_id);
    const existing = state.lines.find((line) => line.id === id);
    const cap = Math.max(0, input.available_qty);
    if (cap <= 0) return;

    const next = roundQuantity(
      Math.min(cap, (existing?.quantity ?? 0) + (quantity > 0 ? quantity : 1)),
    );
    setState({
      ...state,
      lines: lines.map((line) =>
        line.id === id ? { ...line, quantity: next } : line,
      ),
      mergeKey: idempotencyKey(),
    });
  },

  /** Set an exact quantity; 0 or less removes the line. */
  async setQuantity(id: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await cartStore.removeItem(id);
      return;
    }

    if (state.server) {
      const [product_id, variant] = id.split("::");
      const item = serverItemFor(product_id, variant || null);
      if (!item?.id || item.quantity === quantity) return;
      await withPending(async () => {
        const cart = await api.updateCartItem(item.id, quantity);
        setState({ ...state, server: cart }, { save: false });
      });
      return;
    }

    const existing = state.lines.find((line) => line.id === id);
    if (!existing) return;
    const line = clampLine({ ...existing, quantity });
    if (line.quantity === existing.quantity) return;

    setState({
      ...state,
      lines: state.lines.map((item) => (item.id === id ? line : item)),
      mergeKey: idempotencyKey(),
    });
  },

  async removeItem(id: string): Promise<void> {
    if (state.server) {
      const [product_id, variant] = id.split("::");
      const item = serverItemFor(product_id, variant || null);
      if (!item?.id) return;
      await withPending(async () => {
        await api.removeCartItem(item.id);
        const cart = await api.getCart();
        setState({ ...state, server: cart }, { save: false });
      });
      return;
    }

    const existing = state.lines.find((line) => line.id === id);
    if (!existing) return;
    const lines = state.lines.filter((line) => line.id !== id);
    // An emptied cart drops the coupon with it: it was validated against a
    // basket that no longer exists.
    setState({
      ...state,
      lines,
      coupon: lines.length ? state.coupon : null,
      mergeKey: idempotencyKey(),
    });
  },

  /**
   * Empty the cart.
   *
   * The contract has no "delete the cart" route, so server-side this removes
   * each line. Placing an order does not need it — the server consumes the
   * cart itself — so this is the shopper's own «إفراغ السلة».
   */
  async clear(): Promise<void> {
    if (state.server) {
      await withPending(async () => {
        for (const item of state.server?.items ?? []) {
          if (item.id) await api.removeCartItem(item.id);
        }
        const cart = await api.getCart();
        setState({ ...state, server: cart }, { save: false });
      });
      return;
    }
    setState({
      ...state,
      lines: [],
      coupon: null,
      mergeKey: idempotencyKey(),
    });
  },

  /**
   * Apply a coupon.
   *
   * Server-backed, POST /coupons/validate attaches it to the cart and the
   * refreshed cart carries the discount the server calculated — the client
   * never works out what a code is worth.
   */
  async applyCouponCode(code: string): Promise<void> {
    const coupon = await api.validateCoupon(code);

    if (state.server) {
      const cart = await api.getCart();
      setState({ ...state, server: cart }, { save: false });
      return;
    }

    setState({
      ...state,
      coupon: {
        code: coupon.code ?? code,
        type: coupon.type === "fixed" ? "fixed" : "percentage",
        value: coupon.value ?? 0,
      },
    });
  },

  /**
   * Take the coupon off.
   *
   * Server-backed this is DELETE /cart/coupon (contract v5.1.0), which answers
   * with the cart repriced without the discount — so, like every other
   * mutation, the response is adopted verbatim and no total is worked out
   * here. Guest-side the coupon only ever lived on the device.
   */
  async removeCoupon(): Promise<void> {
    if (state.server) {
      await withPending(async () => {
        const cart = await api.removeCartCoupon();
        setState({ ...state, server: cart }, { save: false });
      });
      return;
    }
    setState({ ...state, coupon: null });
  },

  /** After an order is placed the server has consumed the cart. */
  async onOrderPlaced(): Promise<void> {
    setState({ ...state, lines: [], coupon: null, mergeKey: null });
    await cartStore.refresh();
  },
};

if (typeof window !== "undefined") {
  // Runs when the client bundle loads — before React hydrates — so the first
  // post-hydration render already has the persisted cart.
  setState({ ...state, ...readStorage(), hydrated: true }, { save: false });

  // A second tab that checks out must not leave this one showing a stale
  // basket. `key === null` is a whole-storage clear.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
    setState({ ...state, ...readStorage(), hydrated: true }, { save: false });
  });
}
