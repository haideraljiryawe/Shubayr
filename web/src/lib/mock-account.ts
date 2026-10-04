import type {
  Address,
  AddressCreate,
  AddressPatch,
  CustomerReview,
  CustomerReviewPage,
  DeliveryRating,
  DeliveryRatingRequest,
  LoyaltyAccount,
  LoyaltyEntry,
  LoyaltyRedemption,
  NotificationPreferenceEntry,
  NotificationPreferences,
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
import { isLive } from "./data-source";
import { primaryImageUrl } from "./product";

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
  username: null,
  // API 6.0: a phone session is always the `app` surface. Its role is
  // resolved by the server and it carries no staff permissions.
  role: "customer",
  permissions: [],
  surface: "app",
  client: "web_store",
  must_change_password: false,
  permission_version: 1,
  created_at: "2026-02-11T09:00:00.000Z",
};

/**
 * Work phones the mock recognises, mirroring the backend seed: signing in
 * with one of these yields a work account instead of a customer, which is
 * what lets the hermetic suite drive the work-account landing.
 */
const MOCK_WORK_PHONES: Record<string, { role: User["role"]; name: string }> = {
  "+9647700000005": { role: "delivery_agent", name: "مندوب التوصيل" },
  "+9647700000008": { role: "order_monitor", name: "مراقب الطلبات" },
};

let currentUser: User = { ...mockUser };

export function getMockUser(): User {
  return currentUser;
}

export function updateMockUser(patch: Partial<User>): User {
  currentUser = { ...currentUser, ...patch };
  return currentUser;
}

/**
 * Sign a phone in, the way the server resolves it: a registered work phone
 * becomes that work account, any other phone is the fixture customer.
 */
export function signInMockPhone(phoneE164: string, phone: string): User {
  const work = MOCK_WORK_PHONES[phoneE164];
  currentUser = work
    ? { ...mockUser, id: `work-${phoneE164}`, phone, ...work }
    : {
        ...mockUser,
        ...(currentUser.role === "customer" ? currentUser : {}),
        phone,
      };
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
    // The recipient for this address, which is
    // independent of the account phone.
    contact_phone: "+9647701234567",
    lat: 32.515,
    lng: 45.8181,
    is_default: true,
    created_at: "2026-05-05T10:30:00.000Z",
  },
  {
    id: "addr-2",
    user_id: mockUser.id,
    label: "العمل",
    city: "بغداد",
    area: "الكرادة",
    street: "شارع 62، بناية النور",
    details: null,
    contact_phone: "+9647701234567",
    lat: null,
    lng: null,
    is_default: false,
    created_at: "2026-07-04T10:30:00.000Z",
  },
];

let addressSequence = addresses.length;

export function listMockAddresses(): Address[] {
  // Default first, so the checkout's preselection matches what the list shows.
  return [...addresses].sort(
    (a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false),
  );
}

/** One saved address, for the checkout mock that snapshots it onto an order. */
export function getMockAddress(id: string | undefined): Address | undefined {
  return addresses.find((entry) => entry.id === id);
}

export function createMockAddress(input: AddressCreate): Address {
  addressSequence += 1;
  const created: Address = {
    ...input,
    id: `addr-${addressSequence}`,
    user_id: currentUser.id,
    is_default: input.is_default ?? addresses.length === 0,
    created_at: new Date().toISOString(),
  };
  if (created.is_default) {
    addresses = addresses.map((item) => ({ ...item, is_default: false }));
  }
  addresses = [...addresses, created];
  return created;
}

export function updateMockAddress(
  id: string,
  input: AddressPatch,
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
    variant_id: product?.variants?.[0]?.id ?? `variant-${productId}`,
    // Name and image are snapshots taken when the order was placed, so a
    // later rename or re-photograph never rewrites order history.
    product_name_ar: product?.name_ar ?? "",
    product_name_en: product?.name_en ?? "",
    image_url: product ? primaryImageUrl(product) : null,
    quantity,
    unit_price: unit,
    line_total: unit * quantity,
  };
}

/**
 * Statuses for which the contract has created a delivery record.
 *
 * Checkout mints one with the order, and it survives cancellation — so every
 * order has a `delivery_id`. The customer-facing delivery STAGE is then read
 * off the order's own status; see lib/order-delivery.ts.
 */
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
  // Checkout copies the chosen address into the order in the same transaction,
  // and nothing rewrites it afterwards. The fixture takes the copy the same
  // way, so the detail page reads snapshots here exactly as it does live —
  // including for `addr-2`, which a later test may well edit or delete.
  const source = addresses.find((entry) => entry.id === address_id);

  return {
    id: order_number.toLowerCase(),
    order_number,
    status,
    payment_method: "cod",
    address_id,
    delivery_id: `dlv-${order_number.toLowerCase()}`,
    subtotal,
    delivery_fee,
    discount,
    total: subtotal + delivery_fee - discount,
    delivery_contact_phone: source?.contact_phone ?? "+9647701234567",
    delivery_address_label: source?.label ?? null,
    delivery_city: source?.city ?? "",
    delivery_area: source?.area ?? null,
    delivery_street: source?.street ?? null,
    delivery_details: source?.details ?? null,
    delivery_lat: source?.lat ?? null,
    delivery_lng: source?.lng ?? null,
    placed_at: isoAgo(placedDaysAgo),
    delivery_attempts: [],
    items,
  };
}

let orders: Order[] = [
  buildOrder("SB-1039", "dispatched", 1, [
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

/**
 * Stamp `OrderItem.reviewed` the way the live API does.
 *
 * It is a per-caller flag the server derives from whether this customer has a
 * review for the line, so the fixture derives it the same way rather than
 * storing it — otherwise writing a review would leave the flag stale and the
 * page would keep offering to review something already reviewed.
 */
function withReviewedFlags(order: Order): Order {
  const reviewed = new Set(
    myReviews.map((review) => review.order_item_id ?? ""),
  );
  return {
    ...order,
    items: (order.items ?? []).map((item) => ({
      ...item,
      reviewed: reviewed.has(item.id ?? ""),
    })),
  };
}

export function listMockOrders(status?: OrderStatus): Order[] {
  const all = [...orders].sort((a, b) =>
    (b.placed_at ?? "").localeCompare(a.placed_at ?? ""),
  );
  return (status ? all.filter((order) => order.status === status) : all).map(
    withReviewedFlags,
  );
}

export function getMockOrder(id: string): Order | undefined {
  const found = orders.find(
    (order) => order.id === id || order.order_number === id,
  );
  return found ? withReviewedFlags(found) : undefined;
}

/**
 * Change a stored order the way the API would (cancel, cancellation request,
 * shortage answer). `getMockOrder` hands out copies, so changes go here.
 */
export function updateMockOrder(
  id: string,
  change: (order: Order) => void,
): Order | undefined {
  const found = orders.find(
    (order) => order.id === id || order.order_number === id,
  );
  if (!found) return undefined;
  change(found);
  return withReviewedFlags(found);
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
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
];

const EVENT_NOTES: Partial<Record<OrderStatus, string>> = {
  pending: "استلمنا طلبك وبانتظار التأكيد.",
  confirmed: "تم تأكيد الطلب وحجز الكمية.",
  preparing: "يتم تجهيز الطلب في المستودع.",
  ready_for_dispatch: "الطلب جاهز وبانتظار المندوب.",
  dispatched: "الطلب مع مندوب التوصيل.",
  delivered: "تم تسليم الطلب واستلام المبلغ.",
  cancelled: "تم إلغاء الطلب.",
};

export function mockTrackingFor(order: Order): OrderTracking {
  const status = order.status ?? "pending";
  const reached: OrderStatus[] =
    status === "cancelled" || status === "failed"
      ? ["pending", "confirmed"]
      : STATUS_FLOW.slice(0, Math.max(1, STATUS_FLOW.indexOf(status) + 1));

  const placedAt = new Date(order.placed_at ?? isoAgo(1)).getTime();
  const events = reached.map((step, index) => ({
    status: step,
    note: EVENT_NOTES[step] ?? null,
    // Steps land a few hours apart, oldest first.
    at: new Date(placedAt + index * 5 * 3_600_000).toISOString(),
  }));

  if (status === "cancelled" || status === "failed") {
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

/**
 * Seeded only while the catalogue is mocked too.
 *
 * These ids belong to the fixture catalogue. With `catalog` live they resolve
 * to nothing — the real API rejects a non-UUID outright — so the page would
 * quietly drop two phantom rows and show an empty wishlist anyway. Starting
 * empty says the same thing honestly, and anything the shopper hearts from the
 * live catalogue is a real id that resolves.
 */
let wishlist: WishlistItem[] = isLive("catalog")
  ? []
  : [
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

let loyaltySeq = 0;

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

export function getMockLoyalty(
  { page = 1, per_page = 20 }: { page?: number; per_page?: number } = {},
): LoyaltyAccount {
  // Newest first; the contract does not promise an order, so the page cannot
  // rely on one and the fixture sorts the way the page renders.
  const ledger = [...(loyalty.ledger ?? [])].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  return {
    ...loyalty,
    page,
    per_page,
    total: ledger.length,
    ledger: ledger.slice((page - 1) * per_page, page * per_page),
  };
}

/**
 * Spend points against the fixture balance.
 *
 * The over-balance refusal is a 409 here too, because that is the case the UI
 * has to handle and a fixture that always succeeds would never exercise it.
 */
export function redeemMockLoyalty(
  points: number,
  note?: string,
): LoyaltyRedemption | null {
  const balance = loyalty.points_balance ?? 0;
  // null rather than a throw: ApiError is a value in ./api, which imports this
  // module, so raising it here would close an import cycle. The caller turns
  // this into the contract's 409.
  if (points > balance) return null;
  const entry: LoyaltyEntry = {
    id: `loy-redeem-${++loyaltySeq}`,
    type: "redeem",
    reason: "manual_redemption",
    points: -points,
    note: note?.trim() || null,
    created_at: new Date(SEEDED_NOW).toISOString(),
  };
  loyalty.points_balance = balance - points;
  loyalty.ledger = [entry, ...(loyalty.ledger ?? [])];
  return {
    entry,
    points_balance: loyalty.points_balance,
    redemption_value: points,
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
    items: [],
  };

  // The server prices a return from the order line's IMMUTABLE unit price and
  // sends the amounts back computed. The fixture stands in for the server, so
  // it does that arithmetic here — the page still only ever renders what it
  // is given.
  const order = orders.find((entry) => entry.id === body.order_id);
  const unitPrices = new Map(
    (order?.items ?? []).map((item) => [item.id ?? "", item.unit_price ?? 0]),
  );

  created.items = body.items.map((item, index) => {
    const unit = unitPrices.get(item.order_item_id) ?? 0;
    return {
      id: `${created.id}-item-${index + 1}`,
      order_item_id: item.order_item_id,
      quantity: item.quantity,
      approved_quantity: 0,
      customer_reason: item.reason,
      unit_price: unit,
      expected_refund: unit * item.quantity,
      approved_refund: 0,
      condition: null,
      restock: false,
      batch_id: null,
    };
  });
  created.expected_refund = created.items.reduce(
    (sum, item) => sum + (item.expected_refund ?? 0),
    0,
  );
  created.refund_amount = 0;

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

/** Edit one of the fixture's own reviews; a content change resets it. */
export function updateMockReview(
  reviewId: string,
  patch: { rating?: number; comment?: string | null },
): Review | undefined {
  const current = myReviews.find((review) => review.id === reviewId);
  if (!current) return undefined;

  const changed =
    (patch.rating !== undefined && patch.rating !== current.rating) ||
    (patch.comment !== undefined && patch.comment !== current.comment);

  const updated: Review = {
    ...current,
    ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
    ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
    // The contract: an edit that changes content returns the review to
    // moderation; a no-op edit leaves its status alone.
    status: changed ? "pending" : current.status,
    ...(changed
      ? { moderation_reason: null, moderated_by: null, moderated_at: null }
      : {}),
    updated_at: new Date(SEEDED_NOW).toISOString(),
  };
  myReviews = myReviews.map((review) =>
    review.id === reviewId ? updated : review,
  );
  return updated;
}

export function deleteMockReview(reviewId: string): boolean {
  if (!myReviews.some((review) => review.id === reviewId)) return false;
  myReviews = myReviews.filter((review) => review.id !== reviewId);
  return true;
}

/** GET /me/reviews: every moderation state, newest first, with product names. */
export function listMockMyReviews({
  page = 1,
  per_page = 20,
}: { page?: number; per_page?: number } = {}): CustomerReviewPage {
  const data: CustomerReview[] = myReviews.map((review) => {
    const product = demoProducts.find(({ id }) => id === review.product_id);
    return {
      ...review,
      product: {
        id: review.product_id ?? "",
        name_ar: product?.name_ar ?? "",
        name_en: product?.name_en ?? "",
      },
    };
  });
  return {
    page,
    per_page,
    total: data.length,
    data: data.slice((page - 1) * per_page, page * per_page),
  };
}

/** The caller's own review of a purchased line, if they wrote one. */
export function findMockReviewForItem(
  orderItemId: string,
): Review | undefined {
  return myReviews.find((review) => review.order_item_id === orderItemId);
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

/* ---------------------------------------------------------------------------
 * Notification preferences.
 *
 * The contract's shape exactly: every type across both channels, with the
 * server's own defaults — transactional push on, promo off — so the mocked
 * settings page renders the same grid the live one does.
 * ------------------------------------------------------------------------- */

const NOTIFICATION_TYPES: NotificationPreferenceEntry["type"][] = [
  "order_placed",
  "order_confirmed",
  "order_status_changed",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "return_update",
  "loyalty_points_earned",
  "review_moderated",
  // API 11.1: customer answers and decisions on their own orders.
  "quantity_reduction_proposed",
  "cancellation_request_approved",
  "cancellation_request_denied",
  "promo",
];

/** Order confirmation SMS is mandatory; the contract refuses to turn it off. */
export function isMandatoryPreference(
  type: NotificationPreferenceEntry["type"],
  channel: NotificationPreferenceEntry["channel"],
): boolean {
  return type === "order_confirmed" && channel === "sms";
}

function defaultPreferences(): NotificationPreferenceEntry[] {
  return NOTIFICATION_TYPES.flatMap((type) =>
    (["push", "sms"] as const).map((channel) => ({
      type,
      channel,
      enabled: isMandatoryPreference(type, channel)
        ? true
        : channel === "push"
          ? type !== "promo"
          : false,
    })),
  );
}

let notificationPreferences = defaultPreferences();

export function getMockNotificationPreferences(): NotificationPreferences {
  return { preferences: notificationPreferences.map((entry) => ({ ...entry })) };
}

/**
 * Apply a partial update. Pairs the patch does not mention are untouched, and
 * an unknown type or channel is dropped rather than stored — the live server
 * answers 422 for those, so the fixture must not quietly accept one.
 */
export function updateMockNotificationPreferences(
  patch: NotificationPreferenceEntry[],
): NotificationPreferences {
  for (const entry of patch) {
    if (!NOTIFICATION_TYPES.includes(entry.type)) continue;
    if (entry.channel !== "push" && entry.channel !== "sms") continue;
    if (isMandatoryPreference(entry.type, entry.channel)) continue;

    notificationPreferences = notificationPreferences.map((current) =>
      current.type === entry.type && current.channel === entry.channel
        ? { ...current, enabled: entry.enabled }
        : current,
    );
  }
  return getMockNotificationPreferences();
}
