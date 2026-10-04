/* ---------------------------------------------------------------------------
 * The cash step of a delivery (API 12.0): marking a COD delivery delivered
 * says what was collected — a confirmed amount, or "not confirmed yet" — with
 * an operation id, so a double tap or a retry replays instead of posting the
 * revenue and the cash twice.
 * ------------------------------------------------------------------------- */

export type CollectionChoice = "confirmed" | "unconfirmed";

export interface CollectionInput {
  operation_id: string;
  collection_confirmation: CollectionChoice;
  collected_amount?: string;
}

/** The API's amount pattern: digits, up to six decimals. */
const AMOUNT = /^\d+(\.\d{1,6})?$/;

/**
 * A typed amount as the API string. Arabic-Indic digits are read as digits,
 * and thousands separators («,» and «٬») are dropped — money is written
 * "25,000" — while the Arabic decimal mark «٫» becomes ".".
 */
export function parseCollectedAmount(raw: string): string | null {
  let out = "";
  for (const char of raw.replace(/[\s‎‏؜]/g, "")) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x660 && code <= 0x669) out += String(code - 0x660);
    else if (code >= 0x6f0 && code <= 0x6f9) out += String(code - 0x6f0);
    else if (char === "٫") out += ".";
    else if (char === "," || char === "٬") continue;
    else out += char;
  }
  if (!AMOUNT.test(out)) return null;
  // "007" → "7": the API compares amounts, and a clean string reads back clean.
  return out.replace(/^0+(?=\d)/, "");
}

/**
 * The request's collection fields. The operation id belongs to one exact
 * request: the same choice and amount reuse it (a retry is a replay), and a
 * different one gets a new id (the API refuses a reused id with a different
 * payload).
 */
export class CollectionOperation {
  private last: { key: string; id: string } | null = null;

  constructor(private readonly newId: () => string = () => `delivery-${crypto.randomUUID()}`) {}

  input(choice: CollectionChoice, amount: string | null): CollectionInput {
    const key = `${choice}:${amount ?? ""}`;
    if (!this.last || this.last.key !== key) this.last = { key, id: this.newId() };
    return {
      operation_id: this.last.id,
      collection_confirmation: choice,
      ...(choice === "confirmed" && amount !== null ? { collected_amount: amount } : {}),
    };
  }
}
