import type {
  Delivery,
  DeliveryCustody,
  DeliveryPage,
  DeliveryStatus,
  InboxNotification,
  MonitorOrderDetail,
  MonitorOrderPage,
  MonitorOrderQuery,
  NotificationPage,
  OrderStatus,
} from "./api";
import type { CollectionInput } from "./collection";
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
          currency: "IQD",
        },
      ],
      subtotal: unit * quantity,
      delivery_fee: 5,
      discount: 0,
      total: unit * quantity + 5,
      currency: "IQD",
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
  order_version: 1,
  agent_id: "work-+9647700000005",
  status: status as DeliveryStatus,
  delivery_fee: 5,
  dispatched_at,
  delivered_at,
}));

/** The out-for-delivery order's goods, held since it left the store. */
export function getMockCustody(): DeliveryCustody {
  const order = monitorOrders[1];
  const lines = deliveries
    .filter((delivery) => delivery.status === "out_for_delivery" || delivery.status === "failed")
    .map((delivery, index) => ({
      holding_id: `mock-holding-${index + 1}`,
      order: { id: delivery.order_id ?? order.id, order_number: monitorOrders.find((row) => row.id === delivery.order_id)?.order_number ?? order.order_number },
      delivery_id: delivery.id ?? `mock-delivery-${index + 1}`,
      batch_id: `mock-batch-${index + 1}`,
      lot_number: `LOT-${index + 1}`,
      variant_id: `mock-variant-${index + 1}`,
      sku: `SKU-${String(index + 1).padStart(3, "0")}`,
      product: { id: `mock-product-${index + 1}`, name_en: "Ceramic mug", name_ar: "كوب خزفي" },
      quantity: 2,
      issued_at: delivery.dispatched_at ?? "2026-09-28T07:30:00Z",
      age_days: 1,
    }));
  return {
    party: {
      id: "work-+9647700000005",
      kind: "internal_agent",
      user_id: "work-+9647700000005",
      name: "Development Delivery",
      phone: "+9647700000005",
      vehicle_number: null,
      description: null,
      notes: null,
      is_active: true,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    goods: {
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      oldest_age_days: lines.length ? Math.max(...lines.map((line) => line.age_days)) : null,
      lines,
    },
    cash: { currency: "IQD", amount: 0, oldest_age_days: null },
  };
}

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
  collection?: CollectionInput,
): Delivery | null | "conflict" {
  const current = deliveries.find((delivery) => delivery.id === id);
  if (!current?.status) return null;
  if (!DELIVERY_TRANSITIONS[current.status].includes(status)) return "conflict";
  const now = new Date().toISOString();
  const order = monitorOrders.find((row) => row.id === current.order_id);
  const due = order?.total ?? 0;
  const collected =
    collection?.collection_confirmation === "confirmed"
      ? Math.min(Number(collection.collected_amount ?? 0), due)
      : null;
  const next: Delivery = {
    ...current,
    status,
    order_version: current.order_version + 1,
    dispatched_at:
      status === "out_for_delivery" ? now : (current.dispatched_at ?? null),
    delivered_at: status === "delivered" ? now : (current.delivered_at ?? null),
    ...(status === "delivered" && collection
      ? {
          collection: {
            id: `mock-collection-${id}`,
            delivery_id: id,
            order_id: current.order_id ?? "",
            party_id: current.agent_id ?? "",
            status:
              collected === null
                ? ("unconfirmed" as const)
                : collected < due
                  ? ("confirmed_short" as const)
                  : ("confirmed_full" as const),
            due_amount: due,
            collected_amount: collected,
            shortfall_amount: collected === null ? null : due - collected,
            currency: "IQD",
            delivered_at: now,
            accounting_date: now.slice(0, 10),
            confirmed_at: collected === null ? null : now,
            delivery_journal_entry_id: `mock-entry-${id}`,
            confirmation_journal_entry_id: null,
          },
        }
      : {}),
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
