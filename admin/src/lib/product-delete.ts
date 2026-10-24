import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Product delete (owner test finding, contract 17.10.0).
 *
 * POST /admin/products/{id}/delete decides on the server: a product nothing
 * durable refers to is deleted completely; one with history is archived
 * instead (hidden from customers and from the default product list, its
 * records kept) and the answer names every kind of history that kept it.
 * The API has no dry run, so the admin explains the rule before asking and
 * reports what actually happened afterwards. Bulk delete calls the same
 * route once per product, one at a time.
 * ------------------------------------------------------------------------- */

export type ProductDeleteResult = components["schemas"]["ProductDeleteResult"];
export type DeleteReason = ProductDeleteResult["reasons"][number];

export const DELETE_REASONS = [
  "order_history",
  "inventory_history",
  "purchase_history",
  "product_reviews",
  "price_approval_history",
  "banner_action",
] as const satisfies readonly DeleteReason[];

export interface DeleteLine {
  id: string;
  name: string;
  outcome: ProductDeleteResult["outcome"] | "failed";
  reasons: DeleteReason[];
  /** For a failure: what went wrong, already in words. */
  message?: string;
}

export interface DeleteSummary {
  deleted: number;
  archived: number;
  failed: number;
  /** Every reason that kept a product, in the API's order, once. */
  reasons: DeleteReason[];
  lines: DeleteLine[];
}

export function deleteSummary(lines: readonly DeleteLine[]): DeleteSummary {
  const seen = new Set(lines.flatMap((line) => line.reasons));
  return {
    deleted: lines.filter((line) => line.outcome === "deleted").length,
    archived: lines.filter((line) => line.outcome === "archived").length,
    failed: lines.filter((line) => line.outcome === "failed").length,
    reasons: DELETE_REASONS.filter((reason) => seen.has(reason)),
    // Failures first, then archived (they need a look), then deleted.
    lines: [...lines].sort((a, b) => rank(a) - rank(b)),
  };
}

const rank = (line: DeleteLine) => (line.outcome === "failed" ? 0 : line.outcome === "archived" ? 1 : 2);

/**
 * Delete (or archive) each product in turn. One at a time: each is its own
 * transaction on the server, and a failure is reported for that product
 * without stopping the rest.
 */
export async function deleteEach(
  products: ReadonlyArray<{ id: string; name: string }>,
  call: (id: string) => Promise<ProductDeleteResult>,
  describe: (cause: unknown) => string,
): Promise<DeleteSummary> {
  const lines: DeleteLine[] = [];
  for (const product of products) {
    try {
      const result = await call(product.id);
      lines.push({ id: product.id, name: product.name, outcome: result.outcome, reasons: [...result.reasons] });
    } catch (cause) {
      lines.push({ id: product.id, name: product.name, outcome: "failed", reasons: [], message: describe(cause) });
    }
  }
  return deleteSummary(lines);
}
