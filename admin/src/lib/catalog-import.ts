import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * The Excel catalog import and the bulk-image ZIP (API 15.1), kept pure so
 * the screens' rules are unit-tested.
 *
 * - Preview writes nothing: every workbook row comes back as create, update,
 *   warning or error, each issue with its Excel cell ("Products+Variants!H4").
 * - Commit applies all valid rows at once. Its operation id is fixed per
 *   import — kept in the session — so a double click, a retry or a reload
 *   while it runs replays the same commit instead of starting a second one.
 * - More than 500 rows validate in the background; the screen polls.
 * ------------------------------------------------------------------------- */

export type CatalogImport = components["schemas"]["CatalogImport"];
export type CatalogImportSummary = components["schemas"]["CatalogImportSummary"];
export type ImportRow = components["schemas"]["CatalogImportPreviewRow"];
export type ImportAction = ImportRow["action"];
export type CommitResult = components["schemas"]["CatalogImportCommitResult"];
export type ImageResult = components["schemas"]["CatalogImageBulkResult"];

export const IMPORT_ACTIONS: readonly ImportAction[] = ["create", "update", "warning", "error"];

/** The hard limit on data rows across both sheets (the API refuses more). */
export const IMPORT_ROW_LIMIT = 5000;

/** Still working on the server: validating in the background, or committing. */
export function isRunning(status: CatalogImport["status"]): boolean {
  return status === "queued" || status === "validating" || status === "committing";
}

/** The badge colour of an import's state. */
export function statusTone(status: CatalogImport["status"]): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "ready") return "info";
  return "warning";
}

/** The badge colour of a preview row's result. */
export function actionTone(action: ImportAction): "success" | "info" | "warning" | "danger" {
  return action === "create" ? "success" : action === "update" ? "info" : action === "warning" ? "warning" : "danger";
}

/** Commit is offered once validation is done and something can be applied. */
export function canCommit(item: CatalogImport): boolean {
  const counts = item.preview?.counts;
  return item.status === "ready" && !!counts && applicableRows(item) > 0;
}

/**
 * Rows per shown result, for the filter chips. (The API's counts.create and
 * counts.update also include warning rows that will be applied.)
 */
export function actionCounts(rows: readonly ImportRow[]): Record<ImportAction, number> {
  const counts: Record<ImportAction, number> = { create: 0, update: 0, warning: 0, error: 0 };
  for (const row of rows) counts[row.action] += 1;
  return counts;
}

/** Rows a commit applies: every row without an error, warnings included. */
export function applicableRows(item: CatalogImport): number {
  const counts = item.preview?.counts;
  return counts ? counts.create + counts.update : item.create_count + item.update_count;
}

/** Whether the import has stock rows a commit would post as opening stock. */
export function hasStockRows(item: CatalogImport): boolean {
  return (item.preview?.rows ?? []).some((row) => row.sheet === "Stock" && row.apply_action !== null);
}

/** Preview rows shown for the chosen actions (all when none is chosen), and a SKU search. */
export function filterRows(rows: readonly ImportRow[], actions: ReadonlySet<ImportAction>, query = ""): ImportRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (actions.size === 0 || actions.has(row.action)) &&
      (!needle || (row.sku ?? "").toLowerCase().includes(needle) || row.issues.some((issue) => issue.cell.toLowerCase().includes(needle))),
  );
}

/** "Products+Variants!H4" → { sheet: "Products+Variants", cell: "H4" }. */
export function splitCell(reference: string): { sheet: string; cell: string } {
  const at = reference.lastIndexOf("!");
  return at < 0 ? { sheet: "", cell: reference } : { sheet: reference.slice(0, at), cell: reference.slice(at + 1) };
}

/** Issue codes the screen explains in words (others show the API's message). */
export const KNOWN_ISSUES = [
  "REQUIRED",
  "CATEGORY_NOT_FOUND",
  "BRAND_NOT_FOUND",
  "SKU_DUPLICATE_IN_FILE",
  "BARCODE_DUPLICATE",
  "PRICE_REQUIRED",
  "PRICE_INVALID",
  "REFERENCE_PRICE_INVALID",
  "CURRENCY_INVALID",
  "CURRENCY_NOT_ENABLED",
  "EXCHANGE_RATE_REQUIRED",
  "ATTRIBUTES_INVALID",
  "BOOLEAN_INVALID",
  "LOW_STOCK_INVALID",
  "STATUS_INVALID",
  "STATUS_DEFAULTED",
  "SKU_NOT_FOUND",
  "LOCATION_NOT_FOUND",
  "LOCATION_CODE_AMBIGUOUS",
  "QUANTITY_INVALID",
  "UNIT_COST_INVALID",
  "EXPIRY_INVALID",
] as const;
export type KnownIssue = (typeof KNOWN_ISSUES)[number];

export function isKnownIssue(code: string): code is KnownIssue {
  return (KNOWN_ISSUES as readonly string[]).includes(code);
}

/**
 * The template's columns, in sheet order, with their exact (bilingual) header
 * text — a renamed header refuses the whole file — and whether a row needs a
 * value. The price needs either Price IQD or a linked currency with its
 * reference price.
 */
export const PRODUCT_COLUMNS = [
  { key: "category_level_1", header: "Category (level 1) / القسم (المستوى 1)", required: true },
  { key: "category_level_2", header: "Subcategory (level 2) / القسم الفرعي (المستوى 2)", required: true },
  { key: "brand", header: "Brand / العلامة التجارية", required: false },
  { key: "product_name_ar", header: "Product name AR / اسم المنتج بالعربية", required: true },
  { key: "product_name_en", header: "Product name EN / اسم المنتج بالإنجليزية", required: true },
  { key: "description_ar", header: "Description AR / الوصف بالعربية", required: false },
  { key: "description_en", header: "Description EN / الوصف بالإنجليزية", required: false },
  { key: "sku", header: "SKU / رمز المخزون", required: true },
  { key: "attributes", header: "Variant attributes / خصائص المتغير", required: false },
  { key: "base_unit", header: "Base unit / الوحدة الأساسية", required: true },
  { key: "whole_units_only", header: "Whole units only / وحدات كاملة فقط", required: true },
  { key: "price_iqd", header: "Price IQD / السعر بالدينار", required: true },
  { key: "reference_currency_code", header: "Linked currency / عملة الربط", required: false },
  { key: "reference_price", header: "Reference price / السعر المرجعي", required: false },
  { key: "low_stock_threshold", header: "Low-stock threshold / حد المخزون المنخفض", required: false },
  { key: "barcode", header: "Barcode / الباركود", required: false },
  { key: "status", header: "Status / الحالة", required: false },
  { key: "image_url_1", header: "Image URL 1–3 / رابط الصورة 1–3", required: false },
] as const;
export const STOCK_COLUMNS = [
  { key: "sku", header: "SKU / رمز المخزون", required: true },
  { key: "location_code", header: "Location code / رمز الموقع", required: true },
  { key: "quantity", header: "Quantity / الكمية", required: true },
  { key: "unit_cost_iqd", header: "Unit cost IQD / كلفة الوحدة بالدينار", required: true },
  { key: "expiry", header: "Expiry YYYY-MM-DD / انتهاء الصلاحية", required: false },
] as const;

/* ------------------------------------------------------------ commit identity */

const OPERATION_PREFIX = "shubayr.import-commit.";

interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The commit's operation id for an import: made once, then the same on every
 * click, retry and reload in this browser session.
 */
export function commitOperationId(importId: string, store: KeyStore | null, make: () => string): string {
  const key = OPERATION_PREFIX + importId;
  try {
    const kept = store?.getItem(key);
    if (kept) return kept;
    const made = `import-${make()}`;
    store?.setItem(key, made);
    return made;
  } catch {
    return `import-${importId}`;
  }
}

/* ------------------------------------------------------------ images */

/** Matched files grouped by product, in product order of first appearance. */
export function groupMatched(
  matched: ImageResult["matched"],
): Array<{
  productId: string;
  productNameAr: string;
  productNameEn: string;
  sku: string;
  files: ImageResult["matched"];
}> {
  const groups = new Map<
    string,
    {
      productId: string;
      productNameAr: string;
      productNameEn: string;
      sku: string;
      files: ImageResult["matched"];
    }
  >();
  for (const item of matched) {
    const group = groups.get(item.product_id) ?? {
      productId: item.product_id,
      productNameAr: item.product_name_ar,
      productNameEn: item.product_name_en,
      sku: item.sku,
      files: [],
    };
    group.files.push(item);
    groups.set(item.product_id, group);
  }
  return [...groups.values()];
}

/** Whether a picked file looks like a ZIP (by type or name; the API decides). */
export function looksLikeZip(file: { name: string; type: string }): boolean {
  return /\.zip$/i.test(file.name) || /zip/i.test(file.type);
}

/** Whether a picked file looks like an .xlsx workbook. */
export function looksLikeWorkbook(file: { name: string; type: string }): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
