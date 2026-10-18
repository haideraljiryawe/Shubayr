import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * The Excel catalog import and the bulk-image ZIP (API 16.1), kept pure so
 * the screens' rules are unit-tested.
 *
 * - Preview writes nothing: every workbook row comes back as create, update,
 *   warning or error, each issue with its Excel cell ("Products+Variants!H4").
 * - More than 500 rows validate in the background; the screen polls.
 * - Commit is queued: the worker applies product rows in batches of up to
 *   250 (then the Stock rows as one opening document), and the import reports
 *   rows and batches applied as it goes. A failed batch stops the import but
 *   keeps the batches before it ("partly applied"); committing again with
 *   the import's own operation id resumes from its checkpoints. The id is
 *   fixed per import, so a double click or a reload never starts a second one.
 * ------------------------------------------------------------------------- */

export type CatalogImport = components["schemas"]["CatalogImport"];
export type CatalogImportSummary = components["schemas"]["CatalogImportSummary"];
export type ImportRow = components["schemas"]["CatalogImportPreviewRow"];
export type ImportAction = ImportRow["action"];
export type CommitResult = components["schemas"]["CatalogImportCommitResult"];
export type ImportProgress = components["schemas"]["CatalogImportProgress"];
export type ImageResult = components["schemas"]["CatalogImageBulkResult"];

export type CommitStatus = ImportRow["commit_status"];

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

/* ------------------------------------------------------------ applying */

/**
 * Where an import stands with its commit:
 * - none: not committed (still checking, ready, or the check itself failed);
 * - applying: the worker is applying batches;
 * - completed: every valid row applied;
 * - partial: a batch failed after earlier batches were applied (they stay);
 * - failed: the commit failed before any row was applied.
 */
export type CommitOutcome = "none" | "applying" | "completed" | "partial" | "failed";

export function commitOutcome(item: Pick<CatalogImport, "status" | "operation_id" | "applied_count">): CommitOutcome {
  if (item.status === "committing") return "applying";
  if (item.status === "completed") return "completed";
  if (item.status === "failed" && item.operation_id) return item.applied_count > 0 ? "partial" : "failed";
  return "none";
}

/** The check failed (bad workbook): nothing can be committed; upload again. */
export function checkFailed(item: Pick<CatalogImport, "status" | "operation_id">): boolean {
  return item.status === "failed" && !item.operation_id;
}

/** A stopped commit can be resumed with the import's own operation id. */
export function canResume(item: CatalogImport): boolean {
  return item.status === "failed" && !!item.operation_id && !!item.preview;
}

/** Rows applied so far, as a whole percentage of the rows the commit applies. */
export function appliedPercent(item: CatalogImport): number {
  const total = applicableRows(item);
  return total > 0 ? Math.min(100, Math.floor((item.applied_count / total) * 100)) : 0;
}

export const COMMIT_STATUSES: readonly CommitStatus[] = ["applied", "failed", "pending", "skipped"];

/** The badge colour of a row's apply result. */
export function commitTone(status: CommitStatus): "success" | "danger" | "neutral" {
  return status === "applied" ? "success" : status === "failed" ? "danger" : "neutral";
}

/** Rows per apply result (for the filter chips once a commit started). */
export function commitCounts(rows: readonly ImportRow[]): Record<CommitStatus, number> {
  const counts: Record<CommitStatus, number> = { applied: 0, failed: 0, pending: 0, skipped: 0 };
  for (const row of rows) counts[row.commit_status] += 1;
  return counts;
}

/**
 * How often to read an import while it works. While it applies, each read is
 * the light progress resource (no preview rows, API 16.3); while it is being
 * checked, the import itself has no preview yet.
 */
export const POLL_MS = 1500;

/** While committing, poll GET …/{id}/progress instead of the whole import. */
export function pollsProgress(status: CatalogImport["status"]): boolean {
  return status === "committing";
}

/**
 * The progress read folded into the import on screen: its state, rows and
 * batches applied. The per-row results come with the full import, read once
 * when the commit settles.
 */
export function withProgress(item: CatalogImport, progress: ImportProgress): CatalogImport {
  return {
    ...item,
    status: progress.status,
    applied_count: progress.rows_applied,
    commit_batches_done: progress.batches_done,
    commit_batches_total: progress.batches_total,
  };
}

/** The commit's answer (queued, or the result on a replay) folded in the same way. */
export function withCommitResult(item: CatalogImport, result: CommitResult): CatalogImport {
  return {
    ...item,
    status: result.status,
    operation_id: result.operation_id,
    opening_id: result.opening_id,
    applied_count: result.applied_rows,
    commit_batches_done: result.commit_batches_done,
    commit_batches_total: result.commit_batches_total,
  };
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
export function filterRows(
  rows: readonly ImportRow[],
  actions: ReadonlySet<ImportAction>,
  query = "",
  applied: ReadonlySet<CommitStatus> = new Set(),
): ImportRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (actions.size === 0 || actions.has(row.action)) &&
      (applied.size === 0 || applied.has(row.commit_status)) &&
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
