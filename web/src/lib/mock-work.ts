import type {
  Delivery,
  DeliveryPage,
  DeliveryStatus,
  InboxNotification,
  MonitorOrderDetail,
  MonitorOrderPage,
  MonitorOrderQuery,
  NotificationPage,
  OrderStatus,
} from "./api";
import { DELIVERY_TRANSITIONS, type DeliveryAction } from "./deliveries";

/* ---------------------------------------------------------------------------
 * Work-page and inbox fixtures (API 6.1, build phase 2).
 *
 * Just enough data for a backend-less demo and the hermetic suite to render
 * the monitor list, the agent's deliveries and the notification center. The
 * filtering here mirrors the server's (status chips counted without the
 * status filter, dates in the store's timezone), but the behaviour that
 * matters — debouncing, cancellation, stale responses, the live stream — is
 * exercised against a scripted API in tests/work-pages.spec.ts, not here.
 * ------------------------------------------------------------------------- */

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "failed",
  "cancelled",
  "return_requested",
  "returned",
];

const CUSTOMERS = [
  { name: "أحمد علي", phone: "+9647701111111" },
  { name: "زينب حسن", phone: "+9647702222222" },
  { name: "Sara Karim", phone: "+9647703333333" },
];

/** 24 orders, one every six hours back from a fixed instant. */
const BASE = Date.parse("2026-09-28T09:00:00Z");
const monitorOrders: MonitorOrderDetail[] = Array.from(
  { length: 24 },
  (_, index) => {
    const customer = CUSTOMERS[index % CUSTOMERS.length];
    const quantity = (index % 3) + 1;
    const unit = 12.5 + index;
    return {
      id: `mock-order-${String(index + 1).padStart(3, "0")}`,
      order_number: `SH-2026-${String(1000 + index)}`,
      status: STATUSES[index % 5],
      customer,
      shipping_snapshot: {
        contact_phone: customer.phone,
        address_label: "المنزل",
        city: "واسط",
        area: "الكوت",
        street: "شارع 14",
        details: "قرب الجامع",
        lat: null,
        lng: null,
      },
      items: [
        {
          id: `mock-item-${index}`,
          product_id: "p-1",
          variant_id: null,
          product_name_ar: "سماعات لاسلكية",
          product_name_en: "Wireless earbuds",
          quantity,
          unit_price: unit,
          line_total: unit * quantity,
        },
      ],
      subtotal: unit * quantity,
      delivery_fee: 5,
      discount: 0,
      total: unit * quantity + 5,
      payment_method: "cod",
      placed_at: new Date(BASE - index * 6 * 3_600_000).toISOString(),
    };
  },
);

/** The calendar day an instant falls on in the store's timezone. */
function storeDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function listMockMonitorOrders(
  query: MonitorOrderQuery,
  timeZone: string,
): MonitorOrderPage {
  const q = query.q ? normalize(query.q.trim()) : "";
  const matching = monitorOrders.filter((order) => {
    const day = storeDay(order.placed_at, timeZone);
    if (query.date_from && day < query.date_from) return false;
    if (query.date_to && day > query.date_to) return false;
    if (!q) return true;
    return (
      normalize(order.order_number).includes(q) ||
      normalize(order.customer.name ?? "").includes(q)
    );
  });
  const status_counts: Record<string, number> = { all: matching.length };
  for (const status of STATUSES) status_counts[status] = 0;
  for (const order of matching) status_counts[order.status] += 1;

  const filtered =
    query.status && query.status !== "all"
      ? matching.filter((order) => order.status === query.status)
      : matching;
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  return {
    page,
    per_page: perPage,
    total: filtered.length,
    status_counts,
    data: filtered
      .slice((page - 1) * perPage, page * perPage)
      .map((order) => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        total: order.total,
        payment_method: order.payment_method,
        placed_at: order.placed_at,
      })),
  };
}

export function getMockMonitorOrder(id: string): MonitorOrderDetail | null {
  return monitorOrders.find((order) => order.id === id) ?? null;
}

/* ---------------------------------------------------------------- deliveries */

let deliveries: Delivery[] = [
  ["assigned", null, null],
  ["out_for_delivery", "2026-09-28T07:30:00Z", null],
  ["delivered", "2026-09-27T10:00:00Z", "2026-09-27T11:20:00Z"],
].map(([status, dispatched_at, delivered_at], index) => ({
  id: `mock-delivery-${index + 1}`,
  order_id: monitorOrders[index].id,
  agent_id: "work-+9647700000005",
  status: status as DeliveryStatus,
  delivery_fee: 5,
  dispatched_at,
  delivered_at,
}));

export function listMockDeliveries(
  status: DeliveryStatus | undefined,
  page: number,
  perPage: number,
): DeliveryPage {
  const filtered = status
    ? deliveries.filter((delivery) => delivery.status === status)
    : deliveries;
  return {
    page,
    per_page: perPage,
    total: filtered.length,
    data: filtered.slice((page - 1) * perPage, page * perPage),
  };
}

/** Null when the delivery does not exist; "conflict" on a move not allowed. */
export function updateMockDelivery(
  id: string,
  status: DeliveryAction,
): Delivery | null | "conflict" {
  const current = deliveries.find((delivery) => delivery.id === id);
  if (!current?.status) return null;
  if (!DELIVERY_TRANSITIONS[current.status].includes(status)) return "conflict";
  const now = new Date().toISOString();
  const next: Delivery = {
    ...current,
    status,
    dispatched_at:
      status === "out_for_delivery" ? now : (current.dispatched_at ?? null),
    delivered_at: status === "delivered" ? now : (current.delivered_at ?? null),
  };
  deliveries = deliveries.map((delivery) =>
    delivery.id === id ? next : delivery,
  );
  return next;
}

/* --------------------------------------------------------------------- inbox */

let inbox: InboxNotification[] = [
  {
    type: "order_confirmed" as const,
    title_ar: "تم تأكيد طلبك",
    body_ar: "طلبك SH-2026-1000 مؤكد وسيُجهَّز قريبًا.",
    title_en: "Your order is confirmed",
    body_en: "Order SH-2026-1000 is confirmed and will be prepared soon.",
    entity_id: monitorOrders[0].id,
    read: false,
  },
  {
    type: "out_for_delivery" as const,
    title_ar: "طلبك في الطريق",
    body_ar: "المندوب في طريقه إليك.",
    title_en: "Your order is on its way",
    body_en: "The delivery agent is on the way.",
    entity_id: monitorOrders[1].id,
    read: false,
  },
  {
    type: "promo" as const,
    title_ar: "عروض نهاية الأسبوع",
    body_ar: "خصومات على الإلكترونيات حتى يوم السبت.",
    title_en: "Weekend offers",
    body_en: "Electronics discounts until Saturday.",
    entity_id: monitorOrders[2].id,
    read: true,
  },
].map((item, index) => ({
  id: `mock-notification-${index + 1}`,
  type: item.type,
  target_role: "customer" as const,
  title_ar: item.title_ar,
  body_ar: item.body_ar,
  title_en: item.title_en,
  body_en: item.body_en,
  deep_link: item.type === "promo" ? "/notifications" : `/orders/${item.entity_id}`,
  entity_type: "order",
  entity_id: item.entity_id,
  created_at: new Date(BASE - index * 3_600_000).toISOString(),
  read_at: item.read ? new Date(BASE).toISOString() : null,
}));

export function listMockInbox(
  page: number,
  perPage: number,
  unread: boolean,
): NotificationPage {
  const filtered = unread ? inbox.filter((item) => !item.read_at) : inbox;
  return {
    page,
    per_page: perPage,
    total: filtered.length,
    data: filtered.slice((page - 1) * perPage, page * perPage),
  };
}

export function mockUnreadCount(): number {
  return inbox.filter((item) => !item.read_at).length;
}

export function markMockRead(id: string): { id: string; read_at: string } | null {
  const item = inbox.find((entry) => entry.id === id);
  if (!item) return null;
  const read_at = item.read_at ?? new Date().toISOString();
  inbox = inbox.map((entry) => (entry.id === id ? { ...entry, read_at } : entry));
  return { id, read_at };
}

export function markAllMockRead(): { updated: number; read_at: string } {
  const read_at = new Date().toISOString();
  const updated = mockUnreadCount();
  inbox = inbox.map((entry) => ({ ...entry, read_at: entry.read_at ?? read_at }));
  return { updated, read_at };
}
