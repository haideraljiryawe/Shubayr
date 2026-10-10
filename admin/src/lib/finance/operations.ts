import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";

/* ---------------------------------------------------------------------------
 * Posting a financial document exactly once.
 *
 * Every posting carries an `operation_id` chosen when the person asks to
 * post (at preview time), not per request. The API locks on it: a second
 * request with the same id — a double click, a retry — waits for the first
 * and gets its stored answer, never a second document.
 *
 * When the answer itself is lost (timeout, dropped connection) the outcome is
 * unknown. The page then asks GET /admin/operations/{id} before offering a
 * retry: a completed operation shows the document it produced; a 404 means
 * nothing was committed, so retrying with the SAME id is safe.
 * ------------------------------------------------------------------------- */

export type FinancialDocument = components["schemas"]["FinancialDocument"];
export type OperationOutcome = components["schemas"]["OperationOutcome"];

export function newOperationId(): string {
  return `op-${crypto.randomUUID()}`;
}

/** A failure after which the request may or may not have been committed. */
export function isUnknownOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  // 0: network error; 502/503/504: the answer was lost past the BFF.
  return error.status === 0 || error.status >= 502;
}

export type Resolution<T = FinancialDocument> =
  | { kind: "posted"; document: T }
  | { kind: "notPosted" }
  | { kind: "processing" }
  | { kind: "failed"; status: number | null };

/** Read an operation lookup (outcome, or the error the lookup raised). */
export function resolveOutcome<T = FinancialDocument>(outcome: OperationOutcome | ApiError): Resolution<T> {
  if (outcome instanceof ApiError) {
    return outcome.status === 404 ? { kind: "notPosted" } : { kind: "failed", status: outcome.status };
  }
  if (outcome.status !== "completed") return { kind: "processing" };
  const status = outcome.response_status ?? 200;
  if (status >= 200 && status < 300 && outcome.response && typeof outcome.response === "object") {
    return { kind: "posted", document: outcome.response as T };
  }
  return { kind: "failed", status };
}

/** The API's refusal to post into a closed month (409). */
export function isClosedPeriod(error: unknown): boolean {
  return error instanceof ApiError && error.code === "PERIOD_CLOSED";
}
