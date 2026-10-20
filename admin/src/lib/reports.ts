import type { RawSearchParams } from "@/lib/table-params";
import { formatAmount, type Decimal } from "@/lib/finance/money";

export const REPORT_IDS = [
  "sales",
  "profitability",
  "profit-loss",
  "trial-balance",
  "balance-sheet",
  "cash",
  "delivery-custody",
  "liabilities",
  "inventory-valuation",
  "purchases",
  "supplier-statement",
  "stock-movement",
  "expenses",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];
export type ReportDateMode = "period" | "as-of";

export interface ReportDefinition {
  id: ReportId;
  permission: string;
  dateMode: ReportDateMode;
  groups?: readonly string[];
  defaultGroup?: string;
  costProtected?: boolean;
}

export const REPORTS: Record<ReportId, ReportDefinition> = {
  sales: { id: "sales", permission: "reports.sales.read", dateMode: "period", groups: ["day", "week", "month", "department", "category", "brand", "product", "sku"], defaultGroup: "day" },
  profitability: { id: "profitability", permission: "reports.profit.read", dateMode: "period", groups: ["department", "category", "product", "sku"], defaultGroup: "product", costProtected: true },
  "profit-loss": { id: "profit-loss", permission: "reports.financial.read", dateMode: "period", costProtected: true },
  "trial-balance": { id: "trial-balance", permission: "reports.financial.read", dateMode: "as-of" },
  "balance-sheet": { id: "balance-sheet", permission: "reports.financial.read", dateMode: "as-of" },
  cash: { id: "cash", permission: "reports.cash.read", dateMode: "period" },
  "delivery-custody": { id: "delivery-custody", permission: "reports.cash.read", dateMode: "as-of" },
  liabilities: { id: "liabilities", permission: "reports.liabilities.read", dateMode: "as-of" },
  "inventory-valuation": { id: "inventory-valuation", permission: "reports.inventory.read", dateMode: "as-of", costProtected: true },
  purchases: { id: "purchases", permission: "reports.purchases.read", dateMode: "period", groups: ["period", "supplier", "sku", "category"], defaultGroup: "period", costProtected: true },
  "supplier-statement": { id: "supplier-statement", permission: "reports.suppliers.read", dateMode: "as-of" },
  "stock-movement": { id: "stock-movement", permission: "reports.stock.read", dateMode: "period", costProtected: true },
  expenses: { id: "expenses", permission: "reports.expenses.read", dateMode: "period", groups: ["category", "payee", "month"], defaultGroup: "category" },
};

export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as readonly string[]).includes(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function date(value: string | undefined, fallback: string): string {
  return value && DATE.test(value) ? value : fallback;
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}

export type ReportQuery = Record<string, string | number>;

/** Contract-safe report query parameters from URL state. */
export function reportQuery(id: ReportId, raw: RawSearchParams, today: string): ReportQuery {
  const definition = REPORTS[id];
  const query: ReportQuery = id === "profit-loss" ? {} : {
    page: positiveInt(first(raw.page), 1, Number.MAX_SAFE_INTEGER),
    per_page: positiveInt(first(raw.per_page), 20, 100),
  };
  if (definition.dateMode === "period") {
    query.from = date(first(raw.from), `${today.slice(0, 8)}01`);
    query.to = date(first(raw.to), today);
  } else {
    query.as_of = date(first(raw.as_of), today);
  }
  const group = first(raw.group_by);
  if (definition.groups) {
    query.group_by = definition.groups.includes(group ?? "")
      ? group!
      : definition.defaultGroup!;
  }
  if (id === "inventory-valuation") query.slow_days = positiveInt(first(raw.slow_days), 90, 3650);
  for (const key of ["supplier_id", "variant_id", "category_id", "warehouse_id"] as const) {
    const value = first(raw[key]);
    if (value && UUID.test(value)) query[key] = value;
  }
  const payee = first(raw.payee)?.trim().slice(0, 200);
  if (payee) query.payee = payee;
  return query;
}

export function exportParameters(id: ReportId, query: ReportQuery): Record<string, string | number> {
  const parameters = { ...query };
  delete parameters.page;
  delete parameters.per_page;
  return parameters;
}

export function reportUrl(id: ReportId, query: ReportQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  return `/reports/${id}?${params}`;
}

export function formatReportAmount(value: Decimal | null | undefined, locale: string): string {
  return formatAmount(value, "IQD", 0, locale);
}

export function formatReportNumber(value: Decimal | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return "—";
  const negative = text.startsWith("-");
  const [integer, fraction] = text.replace(/^-/, "").split(".");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    numberingSystem: "latn",
    useGrouping: true,
  }).format(BigInt(integer));
  const trimmed = fraction?.replace(/0+$/, "");
  return `${negative ? "-" : ""}${grouped}${trimmed ? `.${trimmed}` : ""}`;
}

export function localizedReportName(
  value: { name_ar?: string | null; name_en?: string | null },
  locale: string,
): string {
  const primary = locale === "ar" ? value.name_ar : value.name_en;
  const fallback = locale === "ar" ? value.name_en : value.name_ar;
  return primary?.trim() || fallback?.trim() || "—";
}

export type ReportCellKind = "text" | "number" | "money" | "percent" | "date";

export interface ReportCell {
  value: string | number | null;
  kind?: ReportCellKind;
  href?: string;
}

export interface ReportRowView {
  id: string;
  cells: Record<string, ReportCell>;
}

export interface ReportChartPoint {
  label: string;
  value: string;
}

export interface ReportView {
  columns: string[];
  rows: ReportRowView[];
  totals: Array<{ key: string; value: string | number | boolean | null; kind?: ReportCellKind }>;
  page: number;
  perPage: number;
  total: number;
  touchesOpenPeriod: boolean;
  chart: ReportChartPoint[];
}

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const array = (value: unknown): Obj[] => Array.isArray(value) ? value.map(object) : [];
const scalar = (value: unknown): string | number | boolean | null =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
const cell = (value: unknown, kind: ReportCellKind = "text", href?: string): ReportCell => ({ value: scalar(value) as string | number | null, kind, href });
const name = (row: Obj, locale: string) => localizedReportName({ name_ar: scalar(row.name_ar) as string | null, name_en: scalar(row.name_en) as string | null }, locale);

function pagination(data: Obj, rows: ReportRowView[]) {
  const page = object(data.pagination);
  return {
    page: Number(scalar(page.page) ?? 1),
    perPage: Number(scalar(page.per_page) ?? Math.max(rows.length, 1)),
    total: Number(scalar(page.total) ?? rows.length),
  };
}

function scalarTotals(value: unknown, kinds: Record<string, ReportCellKind> = {}) {
  return Object.entries(object(value))
    .filter(([key, item]) => !["key", "name_ar", "name_en"].includes(key) && scalar(item) !== null)
    .map(([key, item]) => ({ key, value: scalar(item), kind: kinds[key] ?? (key.includes("count") || key.includes("quantity") || key.endsWith("days") || key === "balanced" || key.endsWith("reconciled") || key.endsWith("valued") || key === "loyalty_points" ? "number" as const : key === "margin_percent" ? "percent" as const : "money" as const) }));
}

function drilldown(row: Obj): string | undefined {
  const detail = object(row.drilldown);
  const resource = scalar(detail.resource);
  if (resource === "expenses") {
    const group = String(scalar(detail.group_by) ?? "");
    const key = group === "category" ? "category_id" : group === "payee" ? "payee" : "from";
    return `/expenses?${new URLSearchParams({ [key]: String(scalar(detail.group_id) ?? "") })}`;
  }
  if (resource === "stock_movements") {
    return `/inventory/movements?${new URLSearchParams({ variant_id: String(scalar(detail.variant_id) ?? ""), warehouse_id: String(scalar(detail.warehouse_id) ?? ""), from: String(scalar(detail.from) ?? ""), to: String(scalar(detail.to) ?? "") })}`;
  }
  const id = scalar(detail.id);
  if (id && resource === "purchase_invoice") return `/purchasing/invoices/${id}`;
  if (id && resource === "expense") return `/expenses/${id}`;
  return undefined;
}

function groupedHref(groupBy: unknown, key: unknown): string | undefined {
  const id = String(scalar(key) ?? "");
  if (!UUID.test(id)) return undefined;
  if (groupBy === "product") return `/catalog/products/${id}`;
  if (groupBy === "category" || groupBy === "department") return `/catalog/categories?id=${id}`;
  if (groupBy === "brand") return `/catalog/brands?id=${id}`;
  return undefined;
}

/** Convert every contract report shape into the one reusable table view. */
export function reportView(id: ReportId, input: unknown, locale: string): ReportView {
  const data = object(input);
  let columns: string[] = [];
  let rows: ReportRowView[] = [];
  let totals = scalarTotals(data.totals);
  let chart: ReportChartPoint[] = [];

  if (id === "sales" || id === "profitability") {
    const profit = id === "profitability";
    columns = profit
      ? ["group", "net_sales", "cost_of_goods_sold", "return_cost_reversals", "gross_profit", "margin_percent", "inventory_write_downs"]
      : ["group", "gross_sales", "tier_discounts", "coupon_discounts", "other_discounts", "returns", "net_sales", "order_count", "average_order_value"];
    rows = array(data.data).map((row, index) => ({
      id: String(scalar(row.key) ?? index),
      cells: {
        group: cell(name(row, locale), "text", groupedHref(data.group_by, row.key)),
        ...Object.fromEntries(columns.slice(1).map((key) => [key, cell(row[key], key === "order_count" ? "number" : key === "margin_percent" ? "percent" : "money")])),
      },
    }));
    if (id === "sales" && data.group_by === "day") chart = rows.map((row) => ({ label: String(row.cells.group.value ?? ""), value: String(row.cells.net_sales.value ?? "0") }));
  } else if (id === "profit-loss") {
    columns = ["line", "current", "previous"];
    const current = object(data.current);
    const previous = object(data.previous);
    const keys = ["sales_revenue", "delivery_revenue", "sales_returns", "delivery_fee_refunds", "net_revenue", "cost_of_goods_sold", "gross_profit", "operating_expenses", "inventory_write_downs", "other_income", "other_costs", "net_profit"];
    rows = keys.map((key) => ({ id: key, cells: { line: cell(key), current: cell(current[key], "money"), previous: cell(previous[key], "money") } }));
    const previousExpenses = array(previous.expenses);
    rows.push(...array(current.expenses).map((expense, index) => {
      const id = String(scalar(expense.id) ?? index);
      const prior = previousExpenses.find((item) => scalar(item.id) === scalar(expense.id));
      return { id: `expense-${id}`, cells: { line: cell(name(expense, locale), "text", `/finance/ledger/entries?account_id=${id}&from=${scalar(data.from) ?? ""}&to=${scalar(data.to) ?? ""}`), current: cell(expense.amount, "money"), previous: cell(prior?.amount, "money") } };
    }));
    totals = [];
  } else if (id === "trial-balance") {
    columns = ["account", "type", "debit", "credit", "balance"];
    rows = array(data.data).map((row, index) => ({ id: String(scalar(row.id) ?? index), cells: {
      account: cell(`${scalar(row.code) ?? ""} — ${name(row, locale)}`, "text", `/finance/ledger/entries?account_id=${scalar(row.id) ?? ""}&to=${scalar(data.as_of) ?? ""}`),
      type: cell(row.type), debit: cell(row.debit, "money"), credit: cell(row.credit, "money"), balance: cell(row.balance, "money"),
    } }));
    totals = [
      { key: "debit_total", value: scalar(data.debit_total), kind: "money" },
      { key: "credit_total", value: scalar(data.credit_total), kind: "money" },
      { key: "balanced", value: scalar(data.balanced), kind: "number" },
    ];
  } else if (id === "balance-sheet") {
    columns = ["account", "type", "balance"];
    rows = array(data.data).map((row, index) => ({ id: String(scalar(row.id) ?? index), cells: {
      account: cell(`${scalar(row.code) ?? ""} — ${name(row, locale)}`, "text", `/finance/ledger/entries?account_id=${scalar(row.id) ?? ""}&to=${scalar(data.as_of) ?? ""}`), type: cell(row.type), balance: cell(row.balance, "money"),
    } }));
  } else if (id === "cash") {
    columns = ["cash_account", "opening_balance", "inflows", "outflows", "closing_balance"];
    rows = array(data.data).map((row, index) => {
      const account = object(row.cash_account);
      return { id: String(scalar(account.id) ?? index), cells: { cash_account: cell(account.name, "text", "/finance/cash-accounts"), opening_balance: cell(row.opening_balance, "money"), inflows: cell(row.inflows, "money"), outflows: cell(row.outflows, "money"), closing_balance: cell(row.closing_balance, "money") } };
    });
  } else if (id === "delivery-custody") {
    const costVisible = Object.prototype.hasOwnProperty.call(object(data.totals), "goods_value") || array(data.data).some((row) => Object.prototype.hasOwnProperty.call(row, "goods_value"));
    columns = ["party", "goods_quantity", ...(costVisible ? ["goods_value"] : []), "cash_held", "oldest_goods_age_days", "oldest_cash_age_days"];
    rows = array(data.data).map((row, index) => {
      const party = object(row.party);
      return { id: String(scalar(party.id) ?? index), cells: { party: cell(party.name, "text", `/delivery-parties/${scalar(party.id) ?? ""}`), goods_quantity: cell(row.goods_quantity, "number"), goods_value: cell(row.goods_value, "money"), cash_held: cell(row.cash_held, "money"), oldest_goods_age_days: cell(row.oldest_goods_age_days, "number"), oldest_cash_age_days: cell(row.oldest_cash_age_days, "number") } };
    });
  } else if (id === "liabilities") {
    columns = ["type", "name", "document_number", "due_date", "age_days", "ageing_bucket", "amount"];
    rows = array(data.data).map((row, index) => {
      const entityId = String(scalar(row.entity_id) ?? "");
      const type = scalar(row.type);
      const href = type === "supplier_payable" ? `/purchasing/suppliers/${entityId}` : type === "accrued_expense" ? `/expenses/${entityId}` : type === "customer_refund" ? `/returns/${entityId}` : type === "unallocated_receipt" ? "/finance/cash-receipts/unallocated" : undefined;
      return { id: `${type ?? "row"}-${entityId || index}`, cells: { type: cell(row.type), name: cell(row.name, "text", href), document_number: cell(row.document_number), due_date: cell(row.due_date, "date"), age_days: cell(row.age_days, "number"), ageing_bucket: cell(row.ageing_bucket), amount: cell(row.amount, "money") } };
    });
  } else if (id === "inventory-valuation") {
    columns = ["sku", "product", "warehouse", "quantity", "moving_average_cost", "value", "stock_state", "last_sale_date", "slow_moving"];
    rows = array(data.data).map((row, index) => {
      const product = object(row.product);
      const warehouse = object(row.warehouse);
      return { id: `${scalar(row.variant_id) ?? index}-${scalar(warehouse.id) ?? ""}`, cells: { sku: cell(row.sku), product: cell(name(product, locale), "text", `/catalog/products/${scalar(product.id) ?? ""}`), warehouse: cell(warehouse.name), quantity: cell(row.quantity, "number"), moving_average_cost: cell(row.moving_average_cost, "money"), value: cell(row.value, "money"), stock_state: cell(row.stock_state), last_sale_date: cell(row.last_sale_date, "date"), slow_moving: cell(row.slow_moving, "number") } };
    });
  } else if (id === "purchases") {
    columns = ["group", "purchased_quantity", "returned_quantity", "net_quantity", "goods_cost_iqd", "landed_cost_iqd", "purchase_cost_iqd", "returns_iqd", "net_cost_iqd", "document_count"];
    rows = array(data.data).map((row, index) => {
      const detail = object(row.drilldown);
      const group = String(scalar(detail.group_by) ?? "");
      const groupId = String(scalar(detail.group_id) ?? "");
      const href = group === "supplier" ? `/purchasing/invoices?supplier_id=${groupId}` : `/purchasing/invoices`;
      return { id: String(scalar(row.group_id) ?? index), cells: { group: cell(name(row, locale), "text", href), ...Object.fromEntries(columns.slice(1).map((key) => [key, cell(row[key], key.includes("quantity") || key === "document_count" ? "number" : "money")])) } };
    });
  } else if (id === "supplier-statement") {
    columns = ["document_number", "source_type", "document_date", "currency", "debit_currency", "credit_currency", "debit_iqd", "credit_iqd"];
    rows = array(data.data).map((row, index) => ({ id: String(scalar(row.id) ?? index), cells: { document_number: cell(row.document_number, "text", drilldown(row)), source_type: cell(row.source_type), document_date: cell(row.document_date, "date"), currency: cell(row.currency), debit_currency: cell(row.debit_currency, "number"), credit_currency: cell(row.credit_currency, "number"), debit_iqd: cell(row.debit_iqd, "money"), credit_iqd: cell(row.credit_iqd, "money") } }));
    totals = [...scalarTotals(data.totals), ...scalarTotals(data.reconciliation)];
  } else if (id === "stock-movement") {
    columns = ["sku", "product", "warehouse", "opening_quantity", "receipts_quantity", "sales_quantity", "returns_quantity", "transfers_quantity", "counts_write_downs_quantity", "closing_quantity", "closing_value_iqd"];
    rows = array(data.data).map((row, index) => {
      const product = object(row.product);
      const warehouse = object(row.warehouse);
      return { id: `${scalar(row.variant_id) ?? index}-${scalar(warehouse.id) ?? ""}`, cells: { sku: cell(row.sku, "text", drilldown(row)), product: cell(name(product, locale)), warehouse: cell(warehouse.name), ...Object.fromEntries(columns.slice(3).map((key) => [key, cell(row[key], key.endsWith("_iqd") ? "money" : "number")])) } };
    });
  } else if (id === "expenses") {
    columns = ["group", "immediate_iqd", "prepaid_amortisation_iqd", "corrections_iqd", "total_iqd", "document_count"];
    rows = array(data.data).map((row, index) => ({ id: String(scalar(row.group_id) ?? index), cells: { group: cell(name(row, locale), "text", drilldown(row)), ...Object.fromEntries(columns.slice(1).map((key) => [key, cell(row[key], key === "document_count" ? "number" : "money")])) } }));
    if (data.group_by === "category") chart = rows.map((row) => ({ label: String(row.cells.group.value ?? ""), value: String(row.cells.total_iqd.value ?? "0") }));
  }

  const paging = pagination(data, rows);
  return { columns, rows, totals, ...paging, touchesOpenPeriod: data.touches_open_period === true, chart };
}
