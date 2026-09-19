import type {
  Address,
  AddressInput,
  DeliveryRating,
  DeliveryRatingRequest,
  LoyaltyAccount,
  Order,
  OrderStatus,
  OrderTracking,
  Return,
  ReturnRequest,
  Review,
  ReviewRequest,
  User,
  WishlistItem,
} from "./api";
import { demoProducts } from "./mock-data";

/* ---------------------------------------------------------------------------
 * Account fixtures: the signed-in customer, their addresses and their orders.
 *
 * These stand in for the authenticated half of the contract until the backend
 * serves it. State lives in module variables, so it survives navigation within
 * a tab and resets on reload — enough to exercise create/update/delete without
 * pretending to be a database.
 *
 * NOTHING HERE IS A CREDENTIAL. The tokens are readable strings with an expiry
 * baked in precisely so the client's 401 → refresh → retry path can be driven
 * in tests; a real token is opaque and signed.
 * ------------------------------------------------------------------------- */

/** The OTP the mock accepts. Any other 6-digit code is rejected as wrong. */
export const MOCK_OTP = "123456";

/** How long a mock access token stays valid. */
const ACCESS_TTL_MS = 60 * 60 * 1000;

export function mockAccessToken(userId: string): string {
  return `mock-access.${Date.now() + ACCESS_TTL_MS}.${userId}`;
}

export function mockRefreshToken(userId: string): string {
  return `mock-refresh.${userId}`;
}

/** True while a mock access token is well-formed and unexpired. */
export function isMockAccessTokenValid(token: string | null): boolean {
  if (!token) return false;
  const [prefix, expiresAt] = token.split(".");
  if (prefix !== "mock-access") return false;
  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function isMockRefreshTokenValid(token: string): boolean {
  return token.startsWith("mock-refresh.");
}

export const mockUser: User = {
  id: "u-1",
  name: "أحمد علي",
  phone: "07701234567",
  email: null,
  is_active: true,
  role: "customer",
  // The contract flattens role permissions onto the user; a customer's set is
  // what the storefront may do on its own data.
  permissions: ["orders.read", "orders.create", "addresses.write"],
  created_at: "2026-02-11T09:00:00.000Z",
};

let currentUser: User = { ...mockUser };

export function getMockUser(): User {
  return currentUser;
}

export function updateMockUser(patch: Partial<User>): User {
  currentUser = { ...currentUser, ...patch };
  return currentUser;
}

/* ------------------------------------------------------------------ addresses */

let addresses: Address[] = [
  {
    id: "addr-1",
    user_id: mockUser.id,
    label: "المنزل",
    city: "واسط",
    area: "الكوت — حي الزهراء",
    street: "شارع 14، دار 22",
    details: "قرب مدرسة الأمل، الطابق الأول",
    lat: 32.515,
    lng: 45.8181,
    is_default: true,
  },
  {
    id: "addr-2",
    user_id: mockUser.id,
    label: "العمل",
    city: "بغداد",
    area: "الكرادة",
    street: "شارع 62، بناية النور",
    details: null,
    lat: null,
    lng: null,
    is_default: false,
  },
];

let addressSequence = addresses.length;

export function listMockAddresses(): Address[] {
  // Default first, so the checkout's preselection matches what the list shows.
  return [...addresses].sort(
    (a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false),
  );
}

export function createMockAddress(input: AddressInput): Address {
  addressSequence += 1;
  const created: Address = {
    ...input,
    id: `addr-${addressSequence}`,
    user_id: currentUser.id,
    is_default: input.is_default ?? addresses.length === 0,
  };
  if (created.is_default) {
    addresses = addresses.map((item) => ({ ...item, is_default: false }));
  }
  addresses = [...addresses, created];
  return created;
}

export function updateMockAddress(
  id: string,
  input: AddressInput,
): Address | undefined {
  const existing = addresses.find((item) => item.id === id);
  if (!existing) return undefined;

  const updated: Address = { ...existing, ...input, id, user_id: existing.user_id };
  // Exactly one default: promoting this one demotes the rest.
  addresses = addresses.map((item) =>
    item.id === id
      ? updated
      : updated.is_default
        ? { ...item, is_default: false }
        : item,
  );
  return updated;
}

export function deleteMockAddress(id: string): boolean {
  const before = addresses.length;
  addresses = addresses.filter((item) => item.id !== id);
  // Never leave the account without a default to preselect.
  if (addresses.length && !addresses.some((item) => item.is_default)) {
    addresses = addresses.map((item, index) =>
      index === 0 ? { ...item, is_default: true } : item,
    );
  }
  return addresses.length < before;
}

/* --------------------------------------------------------------------- orders */

const DAY_MS = 86_400_000;

/** Stable "now" for the fixtures, so order dates never drift between renders. */
const SEEDED_NOW = Date.UTC(2026, 8, 2, 10, 30);

function isoAgo(days: number, hours = 0): string {
  return new Date(SEEDED_NOW - days * DAY_MS - hours * 3_600_000).toISOString();
}

function orderItem(
  productId: string,
  quantity: number,
): NonNullable<Order["items"]>[number] {
  const product = demoProducts.find((item) => item.id === productId);
  // Orders capture effective_price at placement, per the contract.
  const unit = product?.effective_price ?? 0;
  return {
    id: `oi-${productId}`,
    product_id: productId,
    variant_id: null,
    // Name and image are snapshots taken when the order was placed, so a
    // later rename or re-photograph never rewrites order history.
    product_name_ar: product?.name_ar ?? "",
    product_name_en: product?.name_en ?? "",
    image_url: product?.images?.[0] ?? null,
    quantity,
    unit_price: unit,
    line_total: unit * quantity,
  };
}

function buildOrder(
  order_number: string,
  status: OrderStatus,
  placedDaysAgo: number,
  items: Order["items"],
  { discount = 0, address_id = "addr-1" } = {},
): Order {
  const subtotal = (items ?? []).reduce(
    (sum, item) => sum + (item.line_total ?? 0),
    0,
  );
  const delivery_fee = 5;
  return {
    id: order_number.toLowerCase(),
    order_number,
    status,
    payment_method: "cod",
    address_id,
    subtotal,
    delivery_fee,
    discount,
    total: subtotal + delivery_fee - discount,
    placed_at: isoAgo(placedDaysAgo),
    items,
  };
}

let orders: Order[] = [
  buildOrder("SB-1039", "out_for_delivery", 1, [
    orderItem("p1", 1),
    orderItem("p6", 2),
  ]),
  buildOrder(
    "SB-1035",
    "delivered",
    9,
    // Two lines, one of them ×3, so a partial return and several reviewable
    // items are both exercisable against this fixture.
    [orderItem("p4", 1), orderItem("p10", 3)],
    { discount: 20 },
  ),
  buildOrder("SB-1028", "delivered", 30, [orderItem("p7", 1)]),
  buildOrder("SB-1031", "cancelled", 21, [orderItem("p14", 1)], {
    address_id: "addr-2",
  }),
];

export function listMockOrders(status?: OrderStatus): Order[] {
  const all = [...orders].sort((a, b) =>
    (b.placed_at ?? "").localeCompare(a.placed_at ?? ""),
  );
  return status ? all.filter((order) => order.status === status) : all;
}

export function getMockOrder(id: string): Order | undefined {
  return orders.find(
    (order) => order.id === id || order.order_number === id,
  );
}

/** Remember an order placed during this session so its detail page works. */
export function rememberMockOrder(order: Order): void {
  orders = [order, ...orders];
}

/**
 * The lifecycle each status has already passed through. The contract's timeline
 * is an ordered list of what happened, so a delivered order carries every step
 * before it and a cancelled one stops where it stopped.
 */
const STATUS_FLOW: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "out_for_delivery",
  "delivered",
];

const EVENT_NOTES: Partial<Record<OrderStatus, string>> = {
  pending: "استلمنا طلبك وبانتظار التأكيد.",
  confirmed: "تم تأكيد الطلب وحجز الكمية.",
  processing: "يتم تجهيز الطلب في المستودع.",
  out_for_delivery: "الطلب مع مندوب التوصيل.",
  delivered: "تم تسليم الطلب واستلام المبلغ.",
  cancelled: "تم إلغاء الطلب.",
};

export function mockTrackingFor(order: Order): OrderTracking {
  const status = order.status ?? "pending";
  const reached: OrderStatus[] =
    status === "cancelled" || status === "failed_delivery"
      ? ["pending", "confirmed"]
      : STATUS_FLOW.slice(0, Math.max(1, STATUS_FLOW.indexOf(status) + 1));

  const placedAt = new Date(order.placed_at ?? isoAgo(1)).getTime();
  const events = reached.map((step, index) => ({
    status: step,
    note: EVENT_NOTES[step] ?? null,
    // Steps land a few hours apart, oldest first.
    at: new Date(placedAt + index * 5 * 3_600_000).toISOString(),
  }));

  if (status === "cancelled" || status === "failed_delivery") {
    events.push({
      status,
      note: EVENT_NOTES[status] ?? null,
      at: new Date(placedAt + events.length * 5 * 3_600_000).toISOString(),
    });
  }

  return { order_id: order.id, events };
}

/* ---------------------------------------------------------------------------
 * Wishlist.
 *
 * The signed-in half only. A guest's wishlist lives in wishlist-store.ts and
 * is replayed into these on sign-in, which is the same seam the cart uses.
 * ------------------------------------------------------------------------- */

let wishlist: WishlistItem[] = [
  { id: "wl-p11", product_id: "p11", added_at: isoAgo(3) },
  { id: "wl-p17", product_id: "p17", added_at: isoAgo(11) },
];

/** Wishlist rows carry the whole product, so the page needs no second fetch. */
function withProduct(item: WishlistItem): WishlistItem {
  const product = demoProducts.find(({ id }) => id === item.product_id);
  return product ? { ...item, product } : item;
}

export function listMockWishlist(): WishlistItem[] {
  return wishlist.map(withProduct);
}

export function addMockWishlistItem(productId: string): WishlistItem {
  const existing = wishlist.find((item) => item.product_id === productId);
  if (existing) return withProduct(existing);
  const item: WishlistItem = {
    id: `wl-${productId}`,
    product_id: productId,
    added_at: new Date(SEEDED_NOW).toISOString(),
  };
  wishlist = [item, ...wishlist];
  return withProduct(item);
}

export function removeMockWishlistItem(productId: string): void {
  wishlist = wishlist.filter((item) => item.product_id !== productId);
}

/* ---------------------------------------------------------------------------
 * Loyalty.
 * ------------------------------------------------------------------------- */

const loyalty: LoyaltyAccount = {
  points_balance: 1_240,
  ledger: [
    { type: "earn", points: 320, created_at: isoAgo(9) },
    { type: "redeem", points: -500, created_at: isoAgo(14) },
    { type: "earn", points: 180, created_at: isoAgo(21) },
    { type: "adjust", points: 40, created_at: isoAgo(35) },
    { type: "earn", points: 1_200, created_at: isoAgo(52) },
  ],
};

export function getMockLoyalty(): LoyaltyAccount {
  // Newest first; the contract does not promise an order, so the page cannot
  // rely on one and the fixture sorts the way the page renders.
  return {
    ...loyalty,
    ledger: [...(loyalty.ledger ?? [])].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    ),
  };
}

/* ---------------------------------------------------------------------------
 * Returns.
 * ------------------------------------------------------------------------- */

let returns: Return[] = [
  {
    id: "ret-1",
    order_id: "sb-1028",
    user_id: mockUser.id,
    type: "return",
    status: "approved",
    reason: "المقاس غير مناسب",
    created_at: isoAgo(26),
    items: [{ order_item_id: "oi-p7", quantity: 1 }],
  },
];

let returnSeq = returns.length;

export function listMockReturns(): Return[] {
  return [...returns].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

export function createMockReturn(body: ReturnRequest): Return {
  const created: Return = {
    id: `ret-${++returnSeq}`,
    order_id: body.order_id,
    user_id: mockUser.id,
    type: "return",
    // Every request starts here; moving it on is a staff action.
    status: "requested",
    reason: body.reason ?? null,
    created_at: new Date(SEEDED_NOW).toISOString(),
    items: body.items.map((item) => ({
      order_item_id: item.order_item_id,
      quantity: item.quantity,
    })),
  };
  returns = [created, ...returns];
  return created;
}

/** The quantity already claimed per order item, so a return cannot exceed it. */
export function mockReturnedQuantities(orderId: string): Map<string, number> {
  const claimed = new Map<string, number>();
  for (const entry of returns) {
    if (entry.order_id !== orderId) continue;
    if (entry.status === "rejected") continue;
    for (const item of entry.items ?? []) {
      const key = item.order_item_id ?? "";
      claimed.set(key, (claimed.get(key) ?? 0) + (item.quantity ?? 0));
    }
  }
  return claimed;
}

/* ---------------------------------------------------------------------------
 * Reviews and the delivery rating.
 * ------------------------------------------------------------------------- */

let myReviews: Review[] = [];
let reviewSeq = 0;

export function createMockReview(
  productId: string,
  body: ReviewRequest,
): Review {
  const created: Review = {
    id: `rev-mine-${++reviewSeq}`,
    product_id: productId,
    user_id: mockUser.id,
    order_item_id: body.order_item_id,
    rating: body.rating,
    comment: body.comment ?? null,
    // Tied to an order item, so the contract counts it as verified; it still
    // waits on moderation before it appears on the product page.
    verified_purchase: true,
    status: "pending",
    created_at: new Date(SEEDED_NOW).toISOString(),
  };
  myReviews = [created, ...myReviews];
  return created;
}

export function listMockReviewedOrderItems(orderId: string): string[] {
  const order = getMockOrder(orderId);
  const ids = new Set((order?.items ?? []).map((item) => item.id));
  return myReviews
    .map((review) => review.order_item_id ?? "")
    .filter((id) => ids.has(id));
}

/**
 * The delivery behind an order. The contract has no customer-facing route from
 * an order to its delivery, so the fixture derives a stable id; see the
 * CONTRACT GAP note on api.rateDelivery.
 */
export function mockDeliveryIdFor(order: Order): string | null {
  return order.status === "delivered" ? `dlv-${order.id}` : null;
}

let deliveryRatings: DeliveryRating[] = [];

export function getMockDeliveryRating(
  deliveryId: string,
): DeliveryRating | undefined {
  return deliveryRatings.find((entry) => entry.delivery_id === deliveryId);
}

export function createMockDeliveryRating(
  deliveryId: string,
  body: DeliveryRatingRequest,
): DeliveryRating {
  const created: DeliveryRating = {
    id: `dr-${deliveryRatings.length + 1}`,
    delivery_id: deliveryId,
    agent_id: null,
    user_id: mockUser.id,
    stars: body.stars,
    comment: body.comment ?? null,
    created_at: new Date(SEEDED_NOW).toISOString(),
  };
  deliveryRatings = [created, ...deliveryRatings];
  return created;
}
