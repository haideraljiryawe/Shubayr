import type {
  Address,
  AddressInput,
  Order,
  OrderStatus,
  OrderTracking,
  User,
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
  const unit = product?.sale_price ?? 0;
  return {
    id: `oi-${productId}`,
    product_id: productId,
    variant_id: null,
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
  buildOrder("SB-1035", "delivered", 9, [orderItem("p4", 1)], { discount: 20 }),
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
