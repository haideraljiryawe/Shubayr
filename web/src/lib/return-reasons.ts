import type { ReturnRequest } from "./api";

/* ---------------------------------------------------------------------------
 * Why a line is being returned (POST /returns, contract 17.0): one of the
 * reasons the API accepts, plus the shopper's own words — the contract
 * requires both on every line. The reason also matters to the money: the
 * server refunds the delivery fee automatically only for a full return
 * caused by a defect, a wrong item or a store error. There is no preview of
 * that yet, so the form only says it may apply, never an amount.
 * ------------------------------------------------------------------------- */

export type ReturnReasonCode = ReturnRequest["items"][number]["reason_code"];

/** The reasons the API accepts, in the order the picker lists them. */
export const RETURN_REASON_CODES = [
  "defect",
  "wrong_item",
  "store_error",
  "change_of_mind",
  "other",
] as const satisfies readonly ReturnReasonCode[];

/** Reasons for which the store policy may also refund the delivery fee. */
export const FEE_REFUND_REASONS: ReadonlySet<ReturnReasonCode> = new Set(["defect", "wrong_item", "store_error"]);

export function isReturnReasonCode(value: string): value is ReturnReasonCode {
  return (RETURN_REASON_CODES as readonly string[]).includes(value);
}

export type ReturnLineProblem = "reasonCode" | "note";

/** What a chosen line still lacks: a reason from the list, or the note. */
export function returnLineProblem(line: { reasonCode: string; note: string }): ReturnLineProblem | null {
  if (!isReturnReasonCode(line.reasonCode)) return "reasonCode";
  if (!line.note.trim()) return "note";
  return null;
}

/** Whether any chosen line's reason may also bring the delivery fee back. */
export function mayRefundDeliveryFee(codes: readonly string[]): boolean {
  return codes.some((code) => isReturnReasonCode(code) && FEE_REFUND_REASONS.has(code));
}
