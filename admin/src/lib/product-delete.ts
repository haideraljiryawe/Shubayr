import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Product delete (contract 17.12.0).
 *
 * The server decides per product: one nothing durable refers to is deleted
 * completely; one with history is archived instead (hidden from customers
 * and from the default product list, its records kept). Read-only previews
 * apply exactly the same rule, so the confirmation says in advance what will
 * happen and why. Bulk delete is one idempotent request per batch of up to
 * 500 products: its operation id is made when the dialog opens and reused on
 * a retry after a lost connection, so nothing is applied twice.
 * ------------------------------------------------------------------------- */

export type DeletePreview = components["schemas"]["ProductDeletePreview"];
export type BulkDeleteResult = components["schemas"]["ProductBulkDeleteResult"];
export type BulkDeleteLine = BulkDeleteResult["results"][number];
export type DeleteReason = components["schemas"]["ProductDeleteReason"];

export const DELETE_REASONS = [
  "order_history",
  "inventory_history",
  "purchase_history",
  "product_reviews",
  "price_approval_history",
  "banner_action",
  "product_not_found",
] as const satisfies readonly DeleteReason[];

/** The API's batch limit for previews and bulk delete. */
export const BULK_LIMIT = 500;

/** The message key for a reason; a value added later reads as a generic one, never as its raw key. */
export function reasonKey(reason: string): DeleteReason | "unknown" {
  return (DELETE_REASONS as readonly string[]).includes(reason) ? (reason as DeleteReason) : "unknown";
}

export interface DeleteLine {
  id: string;
  name: string;
  outcome: BulkDeleteLine["outcome"];
  reasons: string[];
  /** For a failure the API didn't explain: what went wrong, already in words. */
  message?: string;
}

export interface DeleteSummary {
  deleted: number;
  archived: number;
  failed: number;
  /** Every reason that kept a product archived, in the API's order, once. */
  reasons: string[];
  lines: DeleteLine[];
}

/** Known reasons in the API's order, then any unknown ones, each once. */
function orderedReasons(reasons: Iterable<string>): string[] {
  const seen = new Set(reasons);
  return [...DELETE_REASONS.filter((reason) => seen.has(reason)), ...[...seen].filter((reason) => reasonKey(reason) === "unknown")];
}

const rank = (line: { outcome: string }) => (line.outcome === "failed" ? 0 : line.outcome === "archived" || line.outcome === "archive" ? 1 : 2);

export function deleteSummary(lines: readonly DeleteLine[]): DeleteSummary {
  return {
    deleted: lines.filter((line) => line.outcome === "deleted").length,
    archived: lines.filter((line) => line.outcome === "archived").length,
    failed: lines.filter((line) => line.outcome === "failed").length,
    reasons: orderedReasons(lines.filter((line) => line.outcome === "archived").flatMap((line) => line.reasons)),
    // Failures first, then archived (they need a look), then deleted.
    lines: [...lines].sort((a, b) => rank(a) - rank(b)),
  };
}

export interface PreviewLine {
  id: string;
  name: string;
  outcome: DeletePreview["outcome"];
  reasons: string[];
}

export interface PreviewSummary {
  delete: PreviewLine[];
  archive: PreviewLine[];
  failed: PreviewLine[];
}

/** The previews grouped by what will happen; a product the API didn't answer for counts as failed. */
export function previewSummary(products: ReadonlyArray<{ id: string; name: string }>, previews: readonly DeletePreview[]): PreviewSummary {
  const byId = new Map(previews.map((preview) => [preview.id, preview]));
  const summary: PreviewSummary = { delete: [], archive: [], failed: [] };
  for (const product of products) {
    const preview = byId.get(product.id);
    const line: PreviewLine = preview
      ? { id: product.id, name: product.name, outcome: preview.outcome, reasons: orderedReasons(preview.reasons) }
      : { id: product.id, name: product.name, outcome: "failed", reasons: ["product_not_found"] };
    summary[line.outcome].push(line);
  }
  return summary;
}

export function chunk<T>(items: readonly T[], size = BULK_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export interface BulkBatch {
  operation_id: string;
  ids: string[];
  /** Set once the server has answered for this batch. */
  results?: BulkDeleteLine[];
}

export const newOperationId = () => crypto.randomUUID();

/**
 * The bulk delete as batches of up to 500, each with its own operation id.
 * Made once, when the dialog opens: a retry sends the same batches with the
 * same ids, and the server answers a repeated one with its first result.
 */
export function planBulk(ids: readonly string[], makeId: () => string = newOperationId, size = BULK_LIMIT): BulkBatch[] {
  return chunk(ids, size).map((part) => ({ operation_id: makeId(), ids: part }));
}

/** A batch that failed part-way: the batches with the answers so far, and why. */
export class BulkDeleteError extends Error {
  constructor(readonly batches: BulkBatch[], readonly index: number, readonly failure: unknown) {
    super("bulk delete interrupted");
    this.name = "BulkDeleteError";
  }
}

/**
 * Send every batch the server hasn't answered yet, one after another. On a
 * failure it throws a BulkDeleteError carrying the answered batches, so the
 * retry resumes where it stopped.
 */
export async function applyBulk(
  batches: readonly BulkBatch[],
  call: (batch: { operation_id: string; ids: string[] }) => Promise<BulkDeleteResult>,
): Promise<BulkBatch[]> {
  const next = batches.map((batch) => ({ ...batch }));
  for (const [index, batch] of next.entries()) {
    if (batch.results) continue;
    try {
      const answer = await call({ operation_id: batch.operation_id, ids: batch.ids });
      next[index] = { ...batch, results: answer.results };
    } catch (cause) {
      throw new BulkDeleteError(next, index, cause);
    }
  }
  return next;
}

/** After a 409 (the id was used for another selection): the same batch under a new id. */
export function renewBatch(batches: readonly BulkBatch[], index: number, makeId: () => string = newOperationId): BulkBatch[] {
  return batches.map((batch, at) => (at === index ? { operation_id: makeId(), ids: batch.ids } : batch));
}

/** Every answered line, named. */
export function bulkLines(batches: readonly BulkBatch[], names: ReadonlyMap<string, string>): DeleteLine[] {
  return batches.flatMap((batch) =>
    (batch.results ?? []).map((line) => ({ id: line.id, name: names.get(line.id) ?? line.id, outcome: line.outcome, reasons: [...line.reasons] })),
  );
}
