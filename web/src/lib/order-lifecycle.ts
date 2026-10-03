import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Order lifecycle v2 for the customer (API 10.0): what the shopper may do
 * with an order, and the answers checkout can get back.
 *
 * - A price that changed since the item went into the cart makes POST /orders
 *   answer 409 PRICE_CHANGED with one entry per SKU (old → new and the new
 *   price version). Nothing is ordered until the shopper accepts, which is a
 *   resubmission carrying those versions.
 * - A pending order is cancelled directly; from confirmed until delivery the
 *   shopper can only REQUEST cancellation, which the store approves or denies.
 * - When preparation comes up short, the store may propose a smaller
 *   quantity; the shopper accepts or declines it.
 * ------------------------------------------------------------------------- */

type FieldError = components["schemas"]["FieldError"];
type Order = components["schemas"]["Order"];

export interface PriceChange {
  variantId: string;
  productId: string | null;
  sku: string;
  oldPrice: number;
  newPrice: number;
  newPriceVersion: string;
  direction: "up" | "down";
}

/** The PRICE_CHANGED entries of a 409, or null for any other refusal. */
export function priceChanges(error: { status?: number; code?: string; errors?: readonly FieldError[] } | null | undefined): PriceChange[] | null {
  if (!error || error.status !== 409 || error.code !== "PRICE_CHANGED") return null;
  const rows = (error.errors ?? []).filter(
    (row) => row.code === "PRICE_CHANGED" && row.variant_id && row.new_price_version !== undefined,
  );
  if (!rows.length) return null;
  return rows.map((row) => ({
    variantId: row.variant_id!,
    productId: row.product_id ?? null,
    sku: row.sku ?? "",
    oldPrice: Number(row.old_price ?? 0),
    newPrice: Number(row.new_price ?? 0),
    newPriceVersion: row.new_price_version!,
    direction: Number(row.new_price ?? 0) >= Number(row.old_price ?? 0) ? "up" : "down",
  }));
}

/** What a resubmission sends to accept exactly these new prices. */
export function acceptedPriceVersions(changes: readonly PriceChange[]): Array<{ variant_id: string; price_version: string }> {
  return changes.map((change) => ({ variant_id: change.variantId, price_version: change.newPriceVersion }));
}

/** Total difference the accepted prices make for the given quantities. */
export function priceChangeDelta(changes: readonly PriceChange[], quantities: ReadonlyMap<string, number>): number {
  return changes.reduce((sum, change) => sum + (change.newPrice - change.oldPrice) * (quantities.get(change.variantId) ?? 0), 0);
}

/** Statuses from which a customer may ask the store to cancel. */
const REQUESTABLE = new Set(["confirmed", "preparing", "ready_for_dispatch", "dispatched", "failed"]);

export type CancelMode =
  /** Pending: cancelled straight away. */
  | "cancel"
  /** Later: a request the store approves or denies. */
  | "request"
  /** A request is already waiting for the store. */
  | "waiting"
  | "none";

export function cancelMode(order: Pick<Order, "status" | "cancellation_request">): CancelMode {
  if (order.status === "pending") return "cancel";
  if (!REQUESTABLE.has(order.status as string)) return "none";
  return order.cancellation_request?.status === "pending" ? "waiting" : "request";
}

export interface ReductionProposal {
  orderItemId: string;
  oldQuantity: number;
  newQuantity: number;
  reason: string;
  status: "pending" | "accepted" | "denied";
}

/** A smaller quantity the store proposed after a preparation shortage. */
export function reductionProposal(order: Pick<Order, "attention_details">): ReductionProposal | null {
  const raw = (order.attention_details as { reduction_proposal?: Record<string, unknown> } | null | undefined)?.reduction_proposal;
  if (!raw) return null;
  const status = String(raw.status ?? "pending");
  return {
    orderItemId: String(raw.order_item_id ?? ""),
    oldQuantity: Number(raw.old_quantity ?? 0),
    newQuantity: Number(raw.new_quantity ?? 0),
    reason: String(raw.reason ?? ""),
    status: status === "accepted" || status === "denied" ? status : "pending",
  };
}
