import { ApiError } from "./api";

/* ---------------------------------------------------------------------------
 * The per-order maximum (NOTE-011, contract 17.7.0).
 *
 * When a product has one, it caps the sum of every variant and every cart line
 * of that product in one order. The store uses it to show the limit and to
 * stop the steppers at what is left; the server stays the authority and
 * refuses anything over it with 409 PRODUCT_ORDER_LIMIT_EXCEEDED, whose
 * allowed/requested quantities are what the shopper is told — never the code.
 * ------------------------------------------------------------------------- */

export const PRODUCT_ORDER_LIMIT_EXCEEDED = "PRODUCT_ORDER_LIMIT_EXCEEDED";

/** The product's per-order maximum, or null when it has none. */
export function purchaseLimit(product: {
  purchase_limit_enabled?: boolean | null;
  purchase_limit_max_quantity?: number | null;
}): number | null {
  if (!product.purchase_limit_enabled) return null;
  const max = Number(product.purchase_limit_max_quantity);
  return Number.isFinite(max) && max > 0 ? max : null;
}

/** Thousandth precision, like the API's quantities. */
const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * How much more of the product one line may hold: the limit minus what the
 * product's OTHER lines in the cart already take. Infinity without a limit.
 */
export function roomForLine(
  limit: number | null | undefined,
  lines: ReadonlyArray<{ id: string; product_id: string; quantity: number }>,
  productId: string,
  lineId?: string,
): number {
  if (limit === null || limit === undefined) return Number.POSITIVE_INFINITY;
  const others = lines
    .filter((line) => line.product_id === productId && line.id !== lineId)
    .reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
  return Math.max(0, round(limit - others));
}

export interface LimitRefusal {
  productId: string | null;
  allowed: number;
  requested: number | null;
}

/** The facts of a 409 PRODUCT_ORDER_LIMIT_EXCEEDED, or null for anything else. */
export function limitRefusal(cause: unknown): LimitRefusal | null {
  if (!(cause instanceof ApiError) || cause.code !== PRODUCT_ORDER_LIMIT_EXCEEDED) return null;
  const details = (cause.details ?? {}) as Record<string, unknown>;
  const allowed = Number(details.allowed_quantity);
  const requested = Number(details.requested_quantity);
  return {
    productId: typeof details.product_id === "string" ? details.product_id : null,
    allowed: Number.isFinite(allowed) ? allowed : 0,
    requested: Number.isFinite(requested) ? requested : null,
  };
}
