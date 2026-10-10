import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";

/* ---------------------------------------------------------------------------
 * Purchasing and suppliers (API 9.0, build phase 6).
 *
 * Every figure the screens preview before posting — base units and cost per
 * base unit, landed-cost shares, a payment's FX difference, a return's value
 * and its effect on the payable, a cost correction's split — is computed
 * here with the server's own rules, in exact fixed-point arithmetic (BigInt
 * at 12 decimals), never in floats. The server still decides: these are
 * previews of what it will post, and the posted document is what is shown
 * afterwards.
 * ------------------------------------------------------------------------- */

export type Supplier = components["schemas"]["Supplier"];
export type SupplierPage = components["schemas"]["SupplierPage"];
export type CurrencyCode = "IQD" | "USD";
export type AllocationMethod = "value" | "quantity" | "manual";
export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus" | "no_due_date";

/** A purchase invoice as the API serves it (the contract leaves it open). */
export interface PurchaseInvoice {
  id: string;
  document_number: string;
  supplier_id: string;
  invoice_number: string | null;
  currency_code: CurrencyCode;
  /** Absent without cost.view. */
  exchange_rate?: number;
  subtotal_currency?: number;
  landed_cost_currency?: number;
  total_cost?: number;
  total_iqd?: number;
  allocation_method: AllocationMethod;
  default_location_id: string;
  document_date: string;
  accounting_date: string;
  due_date: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  journal_entry_id: string;
  created_at: string;
  remaining_currency?: number;
  settlement_status?: "open" | "partial" | "paid";
  supplier?: Supplier;
  items?: PurchaseItem[];
  landed_costs?: Array<{ id: string; kind: string; description: string | null; amount_currency: number; amount_iqd: number; currency_code: CurrencyCode }>;
  payment_allocations?: Array<{ id: string; payment_id: string; amount_invoice_currency: number; fx_difference_iqd?: number }>;
  credit_allocations?: Array<{ id: string; amount_invoice_currency: number }>;
  return_documents?: Array<{ id: string; document_number: string; total_currency: number }>;
  corrections?: Array<{ id: string; document_number: string; kind: string; amount_iqd: number; inventory_iqd: number; custody_iqd: number; cogs_iqd: number }>;
  journal_entry?: { id: string; document_number: string };
}

export interface PurchaseItem {
  id: string;
  invoice_id: string;
  product_id: string;
  variant_id: string;
  location_id: string;
  purchase_quantity: number;
  pack_size: number;
  quantity: number;
  unit_cost?: number;
  base_unit_cost_currency?: number;
  line_total_currency?: number;
  landed_cost_share_iqd?: number;
  landed_unit_cost_iqd?: number;
  currency_code: CurrencyCode;
  lot_number: string | null;
  expiry_date: string | null;
  lot_id: string | null;
  variant?: { id: string; sku: string; base_unit?: string; whole_units_only?: boolean };
  location?: { id: string; code: string };
  lot?: { id: string; lot_number: string | null; purchase_cost?: number; qty_received: number };
}

export interface StatementLine {
  id: string;
  source_type: string;
  source_id: string;
  document_number: string;
  document_date: string;
  due_date: string | null;
  currency_code: CurrencyCode;
  debit_currency: number;
  credit_currency: number;
  debit_iqd: number;
  credit_iqd: number;
  purchase_invoice_id: string | null;
  running_balance_currency: number;
  running_balance_iqd: number;
}

export interface SupplierCredit {
  id: string;
  supplier_id: string;
  source_type: string;
  currency_code: CurrencyCode;
  amount_currency: number;
  remaining_currency: number;
  amount_iqd: number;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  document_number: string;
  supplier_id: string;
  cash_account_id: string;
  currency_code: CurrencyCode;
  amount_currency: number;
  exchange_rate: number;
  amount_iqd: number;
  allocated_currency: number;
  unallocated_currency: number;
  document_date: string;
  reference: string | null;
  journal_entry_id: string;
  allocations?: Array<{ id: string; invoice_id: string; amount_invoice_currency: number; invoice_carrying_iqd: number; payment_iqd: number; fx_difference_iqd: number }>;
  credits?: SupplierCredit[];
}

/* ------------------------------------------------------------ fixed-point */

/** Twelve decimals: the finest precision the purchasing API stores. */
export const SCALE_DIGITS = 12;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

/** A decimal ("1500", "0.25", "-3.5", 2.5) as an integer of 10⁻¹² units. */
export function toFixed(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  const text = typeof value === "number" ? numberText(value) : value.trim();
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return 0n;
  const fraction = (match[3] ?? "").padEnd(SCALE_DIGITS + 1, "0");
  let units = BigInt(match[2] || "0") * SCALE + BigInt(fraction.slice(0, SCALE_DIGITS));
  if (Number(fraction[SCALE_DIGITS]) >= 5) units += 1n;
  return match[1] === "-" ? -units : units;
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 15 });
}

/** Round-half-away-from-zero division of integers. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

export const fx = {
  mul: (a: bigint, b: bigint) => divRound(a * b, SCALE),
  div: (a: bigint, b: bigint) => divRound(a * SCALE, b),
  /** Round to `digits` decimals, still scaled. */
  round: (a: bigint, digits: number) => {
    const step = 10n ** BigInt(SCALE_DIGITS - digits);
    return divRound(a, step) * step;
  },
};

/** Back to a plain decimal string, trailing zeros dropped ("1500", "0.25"). */
export function fixedText(value: bigint, digits = SCALE_DIGITS): string {
  const rounded = fx.round(value, digits);
  const negative = rounded < 0n;
  const abs = negative ? -rounded : rounded;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0").slice(0, digits).replace(/0+$/, "");
  return `${negative && (whole !== 0n || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/* ------------------------------------------------------------ purchases */

/** packs × pack size → base units; cost per pack ÷ pack size → cost per base unit. */
export function packConversion(packs: string | number, packSize: string | number, costPerPack: string | number) {
  const size = toFixed(packSize || "1");
  return {
    baseQuantity: fx.mul(toFixed(packs), size),
    baseUnitCost: size === 0n ? 0n : fx.div(toFixed(costPerPack), size),
    lineTotal: fx.mul(toFixed(packs), toFixed(costPerPack)),
  };
}

/** Whether a base quantity is acceptable for a SKU (≤ 3 decimals; whole for piece SKUs). */
export function baseQuantityError(baseQuantity: bigint, wholeUnitsOnly: boolean): "decimals" | "wholeUnits" | null {
  const thousandth = 10n ** BigInt(SCALE_DIGITS - 3);
  if (baseQuantity % thousandth !== 0n) return "decimals";
  if (wholeUnitsOnly && baseQuantity % SCALE !== 0n) return "wholeUnits";
  return null;
}

/**
 * Landed costs over invoice lines, exactly as the server allocates them:
 * by line value (in the invoice currency) or by base quantity, each share
 * rounded half-up to 12 decimals, the LAST line absorbing the residue — so
 * the shares always sum to the total. Manual shares are the person's own and
 * must sum to the total (the server refuses otherwise).
 */
export function allocateLanded(
  lines: ReadonlyArray<{ value: bigint; quantity: bigint; manual?: bigint }>,
  totalIqd: bigint,
  method: AllocationMethod,
): { shares: bigint[]; error: "zeroBase" | "manualMismatch" | null } {
  if (totalIqd === 0n) return { shares: lines.map(() => 0n), error: null };
  if (method === "manual") {
    const shares = lines.map((line) => line.manual ?? 0n);
    const sum = shares.reduce((a, b) => a + b, 0n);
    return { shares, error: sum === totalIqd ? null : "manualMismatch" };
  }
  const weights = lines.map((line) => (method === "value" ? line.value : line.quantity));
  const denominator = weights.reduce((a, b) => a + b, 0n);
  if (denominator <= 0n) return { shares: lines.map(() => 0n), error: "zeroBase" };
  let assigned = 0n;
  const shares = weights.map((weight, index) => {
    const share = index === weights.length - 1 ? totalIqd - assigned : divRound(totalIqd * weight, denominator);
    assigned += share;
    return share;
  });
  return { shares, error: null };
}

/**
 * Shares for display at a currency's precision that still sum to the total:
 * every share but the last is rounded, the last takes what is left — the
 * server's own rule, applied to what the person reads.
 */
export function displayShares(shares: readonly bigint[], digits: number): bigint[] {
  const total = shares.reduce((a, b) => a + b, 0n);
  let shown = 0n;
  return shares.map((share, index) => {
    const value = index === shares.length - 1 ? fx.round(total, digits) - shown : fx.round(share, digits);
    shown += value;
    return value;
  });
}

/** Landed unit cost in IQD: base unit cost × rate + share ÷ base quantity. */
export function landedUnitCostIqd(baseUnitCost: bigint, rate: bigint, shareIqd: bigint, baseQuantity: bigint): bigint {
  const base = fx.mul(baseUnitCost, rate);
  return baseQuantity === 0n ? base : base + fx.div(shareIqd, baseQuantity);
}

/* ---------------------------------------------------------------- dates */

/** Whole days from `day` to `today` (both YYYY-MM-DD). */
export function daysBefore(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

export type DateProblem = "invalid" | "future" | "needsBackdateApproval" | "needsBackdateReason" | null;

/**
 * The document-date rule the server enforces: never in the future; older
 * than the backdating window (90 days by default) only with backdate.approve
 * and a written reason.
 */
export function documentDateProblem(
  day: string,
  today: string,
  options: { windowDays: number; canBackdate: boolean; reason: string },
): DateProblem {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return "invalid";
  if (day > today) return "future";
  if (daysBefore(day, today) > options.windowDays) {
    if (!options.canBackdate) return "needsBackdateApproval";
    if (options.reason.trim().length < 3) return "needsBackdateReason";
  }
  return null;
}

/* ------------------------------------------------------------- payments */

/**
 * The one foreign currency a supplier payment involves, from its cash account
 * and the invoices it settles (API 10.0.1): "IQD" when everything is in IQD,
 * null when two different foreign currencies are mixed (the server refuses
 * that). The settlement rate is this currency's payment-date rate.
 */
export function settlementCurrency(payment: CurrencyCode, invoices: ReadonlyArray<CurrencyCode>): CurrencyCode | null {
  const foreign = new Set([payment, ...invoices].filter((code) => code !== "IQD"));
  if (foreign.size > 1) return null;
  return foreign.values().next().value ?? "IQD";
}

export interface AllocationPreview {
  invoiceId: string;
  /** What was typed: the allocation in the payment (cash account) currency. */
  amount: bigint;
  /** IQD per unit of the invoice currency used to convert (1 for an IQD invoice). */
  invoiceRate: bigint;
  /** The allocation converted to the invoice currency (6 decimals, as posted). */
  applied: bigint;
  /** True when the payment and the invoice are in different currencies. */
  converted: boolean;
  carryingIqd: bigint;
  paidIqd: bigint;
  /** Positive = FX loss (paid more IQD than carried); negative = FX gain. */
  fxIqd: bigint;
  /** The converted amount exceeds what the invoice still owes. */
  overRemaining: boolean;
}

/**
 * A supplier payment as the server posts it (API 10.0.1). Every amount is in
 * the cash account's currency. Each allocation is paid in IQD at the cash
 * rate, converted to the invoice currency at the payment-date rate, and
 * carried at the invoice's own booked rate; paid minus carried is the FX
 * gain or loss. What is not allocated stays a supplier credit in the payment
 * currency.
 */
export function paymentPreview(input: {
  currency: CurrencyCode;
  amount: bigint;
  /** The settlement currency's payment-date rate (ignored when all is IQD). */
  settlementRate: bigint;
  allocations: ReadonlyArray<{
    invoiceId: string;
    invoiceCurrency: CurrencyCode;
    /** The invoice's booked rate. */
    bookedRate: bigint;
    remaining: bigint;
    amount: bigint;
  }>;
}) {
  const cashRate = input.currency === "IQD" ? SCALE : input.settlementRate;
  const amountIqd = fx.mul(input.amount, cashRate);
  const rows: AllocationPreview[] = input.allocations.map((row) => {
    const invoiceRate = row.invoiceCurrency === "IQD" ? SCALE : input.settlementRate;
    const paidIqd = fx.mul(row.amount, cashRate);
    const applied = invoiceRate === 0n ? 0n : fx.round(fx.div(paidIqd, invoiceRate), 6);
    const carryingIqd = fx.mul(applied, row.bookedRate);
    return {
      invoiceId: row.invoiceId,
      amount: row.amount,
      invoiceRate,
      applied,
      converted: row.invoiceCurrency !== input.currency,
      carryingIqd,
      paidIqd,
      fxIqd: paidIqd - carryingIqd,
      overRemaining: applied > row.remaining,
    };
  });
  const allocated = rows.reduce((sum, row) => sum + row.amount, 0n);
  const unallocated = input.amount - allocated;
  return {
    amountIqd,
    rows,
    fxIqd: rows.reduce((sum, row) => sum + row.fxIqd, 0n),
    allocated,
    allocatedIqd: rows.reduce((sum, row) => sum + row.paidIqd, 0n),
    unallocatedIqd: fx.mul(unallocated, cashRate),
    creditCurrency: unallocated > 0n ? unallocated : 0n,
    overAllocated: allocated > input.amount,
  };
}

/**
 * The largest payment-currency amount (at `digits` decimals) that settles
 * what an invoice still owes without exceeding it — exactly the remainder
 * when the rates allow, otherwise the nearest amount below it.
 */
export function settlingAmount(input: {
  remaining: bigint;
  invoiceCurrency: CurrencyCode;
  paymentCurrency: CurrencyCode;
  settlementRate: bigint;
  digits: number;
}): bigint {
  const invoiceRate = input.invoiceCurrency === "IQD" ? SCALE : input.settlementRate;
  const cashRate = input.paymentCurrency === "IQD" ? SCALE : input.settlementRate;
  if (invoiceRate === 0n || cashRate === 0n || input.remaining <= 0n) return 0n;
  let amount = fx.round(fx.div(fx.mul(input.remaining, invoiceRate), cashRate), input.digits);
  const step = 10n ** BigInt(SCALE_DIGITS - input.digits);
  const applied = (value: bigint) => fx.round(fx.div(fx.mul(value, cashRate), invoiceRate), 6);
  while (amount > 0n && applied(amount) > input.remaining) amount -= step;
  return amount;
}

/* -------------------------------------------------------------- returns */

/**
 * A return to the supplier, valued at each lot's current IQD cost and
 * expressed in the invoice currency at the invoice rate. It reduces what
 * is owed; anything beyond the supplier's open balance becomes a credit.
 */
export function returnPreview(input: {
  lines: ReadonlyArray<{ quantity: bigint; lotCostIqd: bigint }>;
  invoiceRate: bigint;
  supplierBalance: bigint;
}) {
  const totalIqd = input.lines.reduce((sum, line) => sum + fx.mul(line.quantity, line.lotCostIqd), 0n);
  const totalCurrency = input.invoiceRate === 0n ? 0n : fx.div(totalIqd, input.invoiceRate);
  const balanceAfter = input.supplierBalance - totalCurrency;
  return { totalIqd, totalCurrency, balanceAfter, credit: balanceAfter < 0n ? -balanceAfter : 0n };
}

/* ---------------------------------------------------------- corrections */

export interface CorrectionLinePreview {
  purchaseItemId: string;
  unitDifference: bigint;
  warehouse: bigint;
  custody: bigint;
  sold: bigint;
  inventoryIqd: bigint;
  custodyIqd: bigint;
  cogsIqd: bigint;
  inconsistent: boolean;
}

/**
 * A late cost or correction split the way the server posts it: the lot's
 * units still in warehouse stock (any location), out in delivery custody,
 * and the rest — received minus those minus what went back to the
 * supplier — counted as sold.
 */
export function correctionSplit(
  lines: ReadonlyArray<{ purchaseItemId: string; received: bigint; warehouse: bigint; custody: bigint; returned: bigint; unitDifference: bigint }>,
) {
  const rows: CorrectionLinePreview[] = lines.map((line) => {
    const sold = line.received - line.warehouse - line.custody - line.returned;
    return {
      purchaseItemId: line.purchaseItemId,
      unitDifference: line.unitDifference,
      warehouse: line.warehouse,
      custody: line.custody,
      sold,
      inventoryIqd: fx.mul(line.warehouse, line.unitDifference),
      custodyIqd: fx.mul(line.custody, line.unitDifference),
      cogsIqd: fx.mul(sold, line.unitDifference),
      inconsistent: sold < 0n,
    };
  });
  const sum = (key: "inventoryIqd" | "custodyIqd" | "cogsIqd") => rows.reduce((total, row) => total + row[key], 0n);
  const inventoryIqd = sum("inventoryIqd");
  const custodyIqd = sum("custodyIqd");
  const cogsIqd = sum("cogsIqd");
  return { rows, inventoryIqd, custodyIqd, cogsIqd, totalIqd: inventoryIqd + custodyIqd + cogsIqd };
}

/**
 * A late landed cost given as one total, spread over the invoice's lines by
 * value, quantity or by hand, as a per-base-unit difference for each line
 * (the API takes unit differences, at most 12 decimals).
 */
export function unitDifferences(
  lines: ReadonlyArray<{ value: bigint; quantity: bigint; manual?: bigint }>,
  totalIqd: bigint,
  method: AllocationMethod,
) {
  const { shares, error } = allocateLanded(lines, totalIqd, method);
  return {
    error,
    shares,
    units: shares.map((share, index) => (lines[index]!.quantity === 0n ? 0n : fx.div(share, lines[index]!.quantity))),
  };
}

/* ---------------------------------------------------------------- misc */

export const AGING_BUCKETS: readonly AgingBucket[] = ["current", "1_30", "31_60", "61_90", "90_plus", "no_due_date"];

/** Totals per bucket and currency over aging lines. */
export function agingTotals(lines: ReadonlyArray<{ bucket: AgingBucket; currency_code: CurrencyCode; remaining: number; remaining_iqd: number }>) {
  const totals = new Map<AgingBucket, bigint>(AGING_BUCKETS.map((bucket) => [bucket, 0n]));
  let iqd = 0n;
  for (const line of lines) {
    totals.set(line.bucket, (totals.get(line.bucket) ?? 0n) + toFixed(line.remaining_iqd));
    iqd += toFixed(line.remaining_iqd);
  }
  return { byBucket: totals, totalIqd: iqd };
}

/** The server's refusals worth their own message. */
export function isSeparationOfDuties(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SEPARATION_OF_DUTIES_VIOLATION";
}

export function isRateOverrideForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.code === "PURCHASE_RATE_OVERRIDE_REQUIRED";
}

/** 422 EXCHANGE_RATE_NOT_FOUND (declared since API 10.0.1). */
export function isMissingRate(error: unknown): boolean {
  return error instanceof ApiError && error.code === "EXCHANGE_RATE_NOT_FOUND";
}

/** Where a purchasing source type has a page of its own in the admin. */
export function purchasingSourceHref(sourceType: string, sourceId: string | null | undefined): string | null {
  if (!sourceId) return null;
  if (sourceType === "purchase_invoice") return `/purchasing/invoices/${encodeURIComponent(sourceId)}`;
  // Payments, returns and corrections have no read-by-id route in API 9.0.
  return null;
}

/** Plain money text at a precision, Latin digits, grouped. */
export function moneyText(value: bigint, currency: string, digits: number, locale = "en"): string {
  const text = fixedText(value, digits);
  const negative = text.startsWith("-");
  const [whole, fraction] = text.replace(/^-/, "").split(".");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", { numberingSystem: "latn" }).format(BigInt(whole ?? "0"));
  const padded = digits > 0 ? `.${(fraction ?? "").padEnd(digits, "0")}` : "";
  return `${negative ? "-" : ""}${grouped}${padded} ${currency}`;
}

export function precisionOf(currency: string): number {
  return currency === "IQD" ? 0 : 2;
}
