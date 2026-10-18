import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import {
  KNOWN_ISSUES,
  PRODUCT_COLUMNS,
  STOCK_COLUMNS,
  actionCounts,
  actionTone,
  appliedPercent,
  applicableRows,
  canCommit,
  canResume,
  checkFailed,
  commitCounts,
  commitOperationId,
  commitOutcome,
  commitTone,
  filterRows,
  POLL_MS,
  pollsProgress,
  withCommitResult,
  withProgress,
  groupMatched,
  hasStockRows,
  isKnownIssue,
  isRunning,
  looksLikeWorkbook,
  looksLikeZip,
  splitCell,
  statusTone,
  type CatalogImport,
  type ImportRow,
} from "@/lib/catalog-import";

const row = (patch: Partial<ImportRow>): ImportRow => ({
  sheet: "Products+Variants",
  row: 2,
  sku: "SKU-1",
  action: "create",
  apply_action: "create",
  issues: [],
  commit_status: "pending",
  commit_error: null,
  ...patch,
});

const rows: ImportRow[] = [
  row({ row: 2, sku: "A-1" }),
  row({ row: 3, sku: "B-1", action: "update", apply_action: "update" }),
  row({
    row: 4,
    sku: "C-1",
    action: "error",
    apply_action: null,
    issues: [{ severity: "error", code: "PRICE_INVALID", cell: "Products+Variants!L4", message: "Price must be a number" }],
  }),
  row({
    row: 5,
    sku: "D-1",
    action: "warning",
    issues: [{ severity: "warning", code: "STATUS_DEFAULTED", cell: "Products+Variants!Q5", message: "Defaulted" }],
  }),
  row({ sheet: "Stock", row: 2, sku: "A-1", action: "create", apply_action: "create" }),
];

const item = (patch: Partial<CatalogImport>): CatalogImport => ({
  id: "11111111-1111-4111-8111-111111111111",
  file_name: "catalog.xlsx",
  create_missing: false,
  status: "ready",
  progress: 100,
  row_count: rows.length,
  create_count: 3,
  update_count: 1,
  error_count: 1,
  warning_count: 1,
  applied_count: 0,
  commit_batches_done: 0,
  commit_batches_total: 2,
  commit_attempt: 0,
  preview: { rows, counts: { total: 5, create: 3, update: 1, error: 1, warning: 1 } },
  error_report_key: "available",
  operation_id: null,
  opening_id: null,
  created_by: "22222222-2222-4222-8222-222222222222",
  created_by_name: "Import Owner",
  committed_by: null,
  created_at: "2026-10-14T08:00:00Z",
  updated_at: "2026-10-14T08:00:00Z",
  completed_at: null,
  ...patch,
});

describe("catalog import state", () => {
  it("follows the import while the server works on it", () => {
    expect(isRunning("queued")).toBe(true);
    expect(isRunning("validating")).toBe(true);
    expect(isRunning("committing")).toBe(true);
    expect(isRunning("ready")).toBe(false);
    expect(isRunning("completed")).toBe(false);
    expect(isRunning("failed")).toBe(false);
  });

  it("offers commit only for a checked import with valid rows", () => {
    expect(canCommit(item({}))).toBe(true);
    expect(applicableRows(item({}))).toBe(4);
    expect(canCommit(item({ status: "validating" }))).toBe(false);
    expect(canCommit(item({ status: "completed" }))).toBe(false);
    expect(canCommit(item({ preview: { rows: [rows[2]], counts: { total: 1, create: 0, update: 0, error: 1, warning: 0 } } }))).toBe(false);
    expect(canCommit(item({ preview: null }))).toBe(false);
  });

  it("knows when a commit posts opening stock", () => {
    expect(hasStockRows(item({}))).toBe(true);
    expect(hasStockRows(item({ preview: { rows: rows.slice(0, 4), counts: { total: 4, create: 2, update: 1, error: 1, warning: 1 } } }))).toBe(false);
  });

  it("colours states and results", () => {
    expect(statusTone("completed")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("ready")).toBe("info");
    expect(statusTone("validating")).toBe("warning");
    expect(actionTone("create")).toBe("success");
    expect(actionTone("update")).toBe("info");
    expect(actionTone("warning")).toBe("warning");
    expect(actionTone("error")).toBe("danger");
  });
});

describe("preview filters", () => {
  it("counts rows per shown result", () => {
    expect(actionCounts(rows)).toEqual({ create: 2, update: 1, warning: 1, error: 1 });
  });

  it("filters by result, by SKU and by cell", () => {
    expect(filterRows(rows, new Set()).length).toBe(5);
    expect(filterRows(rows, new Set(["error"])).map((r) => r.sku)).toEqual(["C-1"]);
    expect(filterRows(rows, new Set(["create", "warning"])).map((r) => r.row)).toEqual([2, 5, 2]);
    expect(filterRows(rows, new Set(), "a-1").map((r) => r.sheet)).toEqual(["Products+Variants", "Stock"]);
    expect(filterRows(rows, new Set(), "l4").map((r) => r.sku)).toEqual(["C-1"]);
    expect(filterRows(rows, new Set(["update"]), "a-1")).toEqual([]);
  });

  it("splits a cell reference", () => {
    expect(splitCell("Products+Variants!H4")).toEqual({ sheet: "Products+Variants", cell: "H4" });
    expect(splitCell("H4")).toEqual({ sheet: "", cell: "H4" });
  });
});

describe("applying (API 16.1: queued, in batches, resumable)", () => {
  const applying = row({ row: 2, sku: "A-1", commit_status: "applied" });
  const stopped = row({
    row: 3,
    sku: "B-1",
    action: "update",
    apply_action: "update",
    commit_status: "failed",
    commit_error: { code: "EXCHANGE_RATE_REQUIRED", message: "No USD rate" },
  });
  const waiting = row({ row: 4, sku: "C-1", commit_status: "pending" });
  const committedRows = [applying, stopped, waiting, row({ row: 5, action: "error", apply_action: null, commit_status: "skipped" })];

  it("tells a running, finished, partial and failed commit apart from a failed check", () => {
    expect(commitOutcome({ status: "ready", operation_id: null, applied_count: 0 })).toBe("none");
    expect(commitOutcome({ status: "committing", operation_id: "import-x", applied_count: 250 })).toBe("applying");
    expect(commitOutcome({ status: "completed", operation_id: "import-x", applied_count: 3000 })).toBe("completed");
    expect(commitOutcome({ status: "failed", operation_id: "import-x", applied_count: 500 })).toBe("partial");
    expect(commitOutcome({ status: "failed", operation_id: "import-x", applied_count: 0 })).toBe("failed");
    // A workbook that failed its check was never committed.
    expect(commitOutcome({ status: "failed", operation_id: null, applied_count: 0 })).toBe("none");
    expect(checkFailed({ status: "failed", operation_id: null })).toBe(true);
    expect(checkFailed({ status: "failed", operation_id: "import-x" })).toBe(false);
  });

  it("resumes only a stopped commit", () => {
    expect(canResume(item({ status: "failed", operation_id: "import-x", applied_count: 500 }))).toBe(true);
    expect(canResume(item({ status: "failed", operation_id: null }))).toBe(false);
    expect(canResume(item({ status: "failed", operation_id: "import-x", preview: null }))).toBe(false);
    expect(canResume(item({ status: "committing", operation_id: "import-x" }))).toBe(false);
  });

  it("reports progress as a share of the rows the commit applies", () => {
    expect(appliedPercent(item({ status: "committing", applied_count: 0 }))).toBe(0);
    expect(appliedPercent(item({ status: "committing", applied_count: 3 }))).toBe(75);
    expect(appliedPercent(item({ status: "completed", applied_count: 4 }))).toBe(100);
    expect(appliedPercent(item({ preview: { rows: [], counts: { total: 0, create: 0, update: 0, error: 0, warning: 0 } } }))).toBe(0);
  });

  it("counts and filters rows by apply result", () => {
    expect(commitCounts(committedRows)).toEqual({ applied: 1, failed: 1, pending: 1, skipped: 1 });
    expect(filterRows(committedRows, new Set(), "", new Set(["failed"])).map((r) => r.sku)).toEqual(["B-1"]);
    expect(filterRows(committedRows, new Set(["update"]), "", new Set(["applied"]))).toEqual([]);
    expect(commitTone("applied")).toBe("success");
    expect(commitTone("failed")).toBe("danger");
    expect(commitTone("pending")).toBe("neutral");
  });

  it("follows a commit with the light progress read (API 16.3)", () => {
    expect(POLL_MS).toBeLessThanOrEqual(2000);
    expect(pollsProgress("committing")).toBe(true);
    // A check in progress has no preview yet: the import itself is light.
    expect(pollsProgress("validating")).toBe(false);
    expect(pollsProgress("completed")).toBe(false);
    const applying = withProgress(item({ status: "committing", applied_count: 0, commit_batches_done: 0, commit_batches_total: 13 }), {
      id: "11111111-1111-4111-8111-111111111111",
      status: "committing",
      batches_done: 4,
      batches_total: 13,
      rows_applied: 1000,
      rows_failed: 0,
      last_error: null,
    });
    expect([applying.status, applying.applied_count, applying.commit_batches_done, applying.commit_batches_total]).toEqual(["committing", 1000, 4, 13]);
    // The preview rows are kept as they were until the full import is read.
    expect(applying.preview).toEqual(item({}).preview);
  });

  it("folds the commit's answer in without reading the whole import", () => {
    const queued = withCommitResult(item({ status: "ready", operation_id: null }), {
      id: "11111111-1111-4111-8111-111111111111",
      status: "committing",
      operation_id: "import-x",
      created: 3,
      updated: 1,
      skipped_errors: 1,
      applied_rows: 0,
      total_rows: 4,
      commit_batches_done: 0,
      commit_batches_total: 2,
      opening_id: null,
    });
    expect([queued.status, queued.operation_id, queued.applied_count, queued.commit_batches_total]).toEqual(["committing", "import-x", 0, 2]);
    expect(commitOutcome(queued)).toBe("applying");
  });

  it("uses the import's own operation id to resume from any browser", () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) };
    // (The view passes current.operation_id when the import has one; this is the first-commit id.)
    expect(commitOperationId("fresh", storage, () => "u1")).toBe("import-u1");
  });
});

describe("commit identity", () => {
  it("keeps one operation id per import across clicks and reloads", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    let next = 0;
    const make = () => `uuid-${++next}`;
    const first = commitOperationId("import-a", storage, make);
    expect(first).toBe("import-uuid-1");
    // A second click, or a reload in the same session: the same id, so the API replays.
    expect(commitOperationId("import-a", storage, make)).toBe(first);
    // Another import: its own id.
    expect(commitOperationId("import-b", storage, make)).toBe("import-uuid-2");
  });

  it("falls back to an id fixed by the import when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(commitOperationId("abc", broken, () => "x")).toBe("import-abc");
    expect(commitOperationId("abc", broken, () => "y")).toBe("import-abc");
    expect(commitOperationId("abc", null, () => "z")).toBe("import-z");
  });
});

describe("bulk images", () => {
  it("groups matched pictures by product", () => {
    const groups = groupMatched([
      { file: "A.jpg", sku: "A", product_id: "p1", product_name_ar: "أ", product_name_en: "Alpha", url: "https://x/1" },
      { file: "B.jpg", sku: "B", product_id: "p2", product_name_ar: "ب", product_name_en: "Beta", url: "https://x/2" },
      { file: "A-2.jpg", sku: "A", product_id: "p1", product_name_ar: "أ", product_name_en: "Alpha", url: "https://x/3" },
    ]);
    expect(groups.map((group) => [group.productId, group.files.map((file) => file.file)])).toEqual([
      ["p1", ["A.jpg", "A-2.jpg"]],
      ["p2", ["B.jpg"]],
    ]);
    expect(groups[0]).toMatchObject({ productNameAr: "أ", productNameEn: "Alpha" });
  });

  it("recognises the files each screen takes", () => {
    expect(looksLikeZip({ name: "pictures.ZIP", type: "" })).toBe(true);
    expect(looksLikeZip({ name: "pictures", type: "application/x-zip-compressed" })).toBe(true);
    expect(looksLikeZip({ name: "pictures.rar", type: "application/vnd.rar" })).toBe(false);
    expect(looksLikeWorkbook({ name: "catalog.xlsx", type: "" })).toBe(true);
    expect(looksLikeWorkbook({ name: "catalog.csv", type: "text/csv" })).toBe(false);
  });
});

describe("import help messages", () => {
  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: explains every column and every known issue`, () => {
      const help = messages.catalogImport.help as unknown as Record<string, Record<string, string>>;
      for (const column of PRODUCT_COLUMNS) expect(help.columns[column.key], `help.columns.${column.key}`).toBeTruthy();
      for (const column of STOCK_COLUMNS) expect(help.stockColumns[column.key], `help.stockColumns.${column.key}`).toBeTruthy();
      const issues = messages.catalogImport.issues as Record<string, { what: string; fix: string }>;
      for (const code of KNOWN_ISSUES) {
        expect(issues[code]?.what, `issues.${code}.what`).toBeTruthy();
        expect(issues[code]?.fix, `issues.${code}.fix`).toBeTruthy();
      }
      expect(isKnownIssue("PRICE_INVALID")).toBe(true);
      expect(isKnownIssue("SOMETHING_NEW")).toBe(false);
    });
  }
});
