"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, Badge, Button, buttonClasses, Card, Input } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  IMPORT_ACTIONS,
  actionCounts,
  actionTone,
  applicableRows,
  canCommit,
  commitOperationId,
  filterRows,
  hasStockRows,
  isKnownIssue,
  isRunning,
  looksLikeWorkbook,
  statusTone,
  type CatalogImport,
  type CommitResult,
  type ImportAction,
  type ImportRow,
} from "@/lib/catalog-import";
import { postFile } from "@/lib/file-upload";
import { documentHref } from "@/lib/inventory";

const PREVIEW_PAGE = 50;
const POLL_MS = 1500;

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** A progress bar with its percentage, for the upload and the background check. */
function Progress({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span dir="ltr">{value}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-card"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/**
 * The import itself: upload the workbook (with progress), wait for a
 * background check, review every row (filterable by result, with cell
 * references), apply the valid rows once, and see the result.
 */
export function CatalogImportView({ initial, canPostStock }: { initial: CatalogImport | null; canPostStock: boolean }) {
  const t = useTranslations("catalogImport");
  const locale = useLocale();
  const router = useRouter();
  const [current, setCurrent] = useState<CatalogImport | null>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [upload, setUpload] = useState<{ phase: "uploading" | "processing"; percent: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const committingNow = useRef(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [actions, setActions] = useState<Set<ImportAction>>(new Set());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // The address names the import (?id=). Opening another one — from the
  // history, or "import another file" — shows it; the server's copy of the
  // import already on screen (after an upload or a commit) never replaces
  // the newer state held here.
  const [shownId, setShownId] = useState(initial?.id ?? null);
  if ((initial?.id ?? null) !== shownId) {
    setShownId(initial?.id ?? null);
    if ((initial?.id ?? null) !== (current?.id ?? null)) {
      setCurrent(initial);
      setResult(null);
      setProblem(null);
      setActions(new Set());
      setQuery("");
      setPage(0);
    }
  }

  // A check running in the background is followed until it settles.
  const running = current ? isRunning(current.status) : false;
  useEffect(() => {
    if (!current || !running) return;
    let stopped = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await unwrap(browserApi.GET("/admin/catalog-imports/{id}", { params: { path: { id: current.id } } }));
        if (stopped) return;
        setCurrent(next);
        if (!isRunning(next.status)) router.refresh();
      } catch {
        // Try again on the next tick.
        if (!stopped) setCurrent({ ...current });
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [current, running, router]);

  function errorText(cause: unknown): string {
    if (cause instanceof ApiError) {
      if (cause.code && t.has(`errors.${cause.code}`)) return t(`errors.${cause.code}`);
      if (cause.status === 413) return t("errors.tooLarge");
      if (cause.message) return cause.message;
    }
    return t("errors.generic");
  }

  async function check() {
    if (!file) {
      setProblem(t("upload.chooseFile"));
      return;
    }
    if (!looksLikeWorkbook(file)) {
      setProblem(t("upload.notWorkbook"));
      return;
    }
    setProblem(null);
    setUpload({ phase: "uploading", percent: 0 });
    try {
      const item = await postFile<CatalogImport>(`/api/catalog-imports/preview?create_missing=${createMissing}`, file, file.name, {
        onProgress: (percent) => setUpload((now) => (now?.phase === "uploading" ? { phase: "uploading", percent } : now)),
        onUploaded: () => setUpload({ phase: "processing", percent: 100 }),
      });
      setCurrent(item);
      setResult(null);
      // The address keeps the import: a reload or a later visit reopens it.
      router.replace(`/catalog/import?id=${item.id}`, { scroll: false });
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setUpload(null);
    }
  }

  async function commit() {
    if (!current || committingNow.current) return;
    committingNow.current = true;
    setCommitting(true);
    setProblem(null);
    // The same id for every click and retry of this import: the API applies it once.
    const operationId = commitOperationId(current.id, sessionStore(), () => crypto.randomUUID());
    try {
      const done = await unwrap(
        browserApi.POST("/admin/catalog-imports/{id}/commit", {
          params: { path: { id: current.id } },
          body: { operation_id: operationId },
        }),
      );
      setResult(done);
      try {
        setCurrent(await unwrap(browserApi.GET("/admin/catalog-imports/{id}", { params: { path: { id: current.id } } })));
      } catch {
        setCurrent({ ...current, status: done.status, opening_id: done.opening_id });
      }
      router.refresh();
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      committingNow.current = false;
      setCommitting(false);
    }
  }

  function toggleAction(action: ImportAction) {
    setActions((now) => {
      const next = new Set(now);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
    setPage(0);
  }

  const rows = current?.preview?.rows ?? [];
  const counts = actionCounts(rows);
  const shown = filterRows(rows, actions, query);
  const pages = Math.max(1, Math.ceil(shown.length / PREVIEW_PAGE));
  const currentPage = Math.min(page, pages - 1);
  const pageRows = shown.slice(currentPage * PREVIEW_PAGE, (currentPage + 1) * PREVIEW_PAGE);
  const completed = current?.status === "completed";
  const busy = upload !== null || committing;

  const sheetName = (row: ImportRow) => (row.sheet === "Stock" ? t("preview.sheets.stock") : t("preview.sheets.products"));
  const summary = (row: ImportRow) => {
    if (row.product) return locale === "ar" ? row.product.product_name_ar : row.product.product_name_en;
    if (row.stock) return `${row.stock.quantity} → ${row.stock.location_code}`;
    return null;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="catalog-import">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t("template.title")}</h2>
          <p className="text-sm leading-relaxed text-text-muted">{t("template.body")}</p>
          <a
            href="/api/catalog-imports/template"
            className={buttonClasses({ variant: "secondary", className: "self-start" })}
            download
            data-testid="import-template"
          >
            <Download className="size-4" aria-hidden />
            {t("template.download")}
          </a>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t("upload.title")}</h2>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t("upload.file")}
            <Input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="h-auto py-2"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setProblem(null);
              }}
              data-testid="import-file"
            />
            <span className="font-normal text-text-muted">{t("upload.fileHint")}</span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={createMissing}
              disabled={busy}
              onChange={(event) => setCreateMissing(event.target.checked)}
              data-testid="import-create-missing"
            />
            <span>
              <span className="font-semibold">{t("upload.createMissing")}</span>
              <span className="mt-1 block leading-relaxed text-text-muted">{t("upload.createMissingHelp")}</span>
            </span>
          </label>
          {upload ? (
            upload.phase === "uploading" ? (
              <Progress value={upload.percent} label={t("upload.uploading", { percent: upload.percent })} testId="import-upload-progress" />
            ) : (
              <p className="text-sm text-text-muted" role="status">
                {t("upload.processing")}
              </p>
            )
          ) : null}
          <Button className="self-start" onClick={() => void check()} pending={upload !== null} disabled={busy} data-testid="import-check">
            <Upload className="size-4" aria-hidden />
            {t("upload.check")}
          </Button>
        </Card>
      </div>

      {problem ? (
        <Alert data-testid="import-problem">{problem}</Alert>
      ) : null}

      {current ? (
        <Card className="flex flex-col gap-4 p-4" data-testid="import-current" data-id={current.id} data-status={current.status}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{t("preview.title")}</h2>
            <Badge tone={statusTone(current.status)} data-testid="import-status">
              {t(`status.${current.status}`)}
            </Badge>
            <span className="flex items-center gap-1 text-sm text-text-muted" dir="auto">
              <FileSpreadsheet className="size-4" aria-hidden />
              {t("preview.file", { name: current.file_name })}
            </span>
          </div>

          {running ? (
            <div className="flex flex-col gap-2">
              <Progress value={current.progress} label={t("progress.label")} testId="import-progress" />
              {current.status === "committing" ? (
                <p className="text-sm font-medium" data-testid="import-commit-progress">
                  {t("progress.applying", {
                    rowsApplied: current.applied_count,
                    rowsTotal: applicableRows(current),
                    batchesDone: current.commit_batches_done,
                    batchesTotal: current.commit_batches_total,
                  })}
                </p>
              ) : null}
              <p className="text-sm text-text-muted">{t("progress.background")}</p>
            </div>
          ) : null}
          {current.status === "failed" ? <Alert>{t("progress.failed")}</Alert> : null}

          {current.preview ? (
            <>
              {!completed ? <Alert tone="info">{t("preview.nothingWritten")}</Alert> : null}
              {current.create_missing ? <p className="text-sm text-text-muted">{t("preview.createsTaxonomy")}</p> : null}

              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("preview.filterLabel")}>
                <button
                  type="button"
                  className={buttonClasses({ variant: actions.size === 0 ? "primary" : "secondary", size: "sm" })}
                  aria-pressed={actions.size === 0}
                  onClick={() => {
                    setActions(new Set());
                    setPage(0);
                  }}
                  data-testid="import-filter-all"
                >
                  {t("preview.all")} <span dir="ltr">({rows.length})</span>
                </button>
                {IMPORT_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={buttonClasses({ variant: actions.has(action) ? "primary" : "secondary", size: "sm" })}
                    aria-pressed={actions.has(action)}
                    title={t(`preview.actionHelp.${action}`)}
                    onClick={() => toggleAction(action)}
                    data-testid={`import-filter-${action}`}
                    data-count={counts[action]}
                  >
                    {t(`preview.actions.${action}`)} <span dir="ltr">({counts[action]})</span>
                  </button>
                ))}
                <Input
                  type="search"
                  className="h-9 w-full sm:ms-auto sm:w-64"
                  placeholder={t("preview.search")}
                  aria-label={t("preview.search")}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  data-testid="import-search"
                />
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[600px] text-sm" data-testid="import-preview">
                  <thead className="bg-card text-text-muted">
                    <tr>
                      <th className="p-2 text-start font-medium">{t("preview.columns.where")}</th>
                      <th className="p-2 text-start font-medium">{t("preview.columns.sku")}</th>
                      <th className="p-2 text-start font-medium">{t("preview.columns.action")}</th>
                      <th className="p-2 text-start font-medium">{t("preview.columns.issues")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-text-muted">
                          {t("preview.empty")}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => (
                        <tr
                          key={`${row.sheet}-${row.row}`}
                          className="border-t border-border align-top"
                          data-testid="import-row"
                          data-action={row.action}
                          data-sku={row.sku ?? ""}
                        >
                          <td className="whitespace-nowrap p-2">
                            <span className="font-semibold">{sheetName(row)}</span>
                            <span className="block text-text-muted">{t("preview.row", { row: row.row })}</span>
                          </td>
                          <td className="p-2 font-mono text-xs" dir="ltr">
                            {row.sku ?? "—"}
                          </td>
                          <td className="p-2">
                            <Badge tone={actionTone(row.action)}>{t(`preview.actions.${row.action}`)}</Badge>
                            {row.action === "warning" && row.apply_action ? (
                              <span className="mt-1 block text-xs text-text-muted">{t(`preview.actions.${row.apply_action}`)}</span>
                            ) : null}
                          </td>
                          <td className="p-2">
                            {row.issues.length === 0 ? (
                              <span className="text-text-muted" dir="auto">
                                {summary(row) ?? t("preview.fine")}
                              </span>
                            ) : (
                              <ul className="flex flex-col gap-1.5">
                                {row.issues.map((issue, index) => (
                                  <li key={`${issue.cell}-${issue.code}-${index}`} className="flex flex-wrap items-start gap-2" data-testid="import-issue" data-code={issue.code}>
                                    <code
                                      dir="ltr"
                                      className="rounded bg-card px-1.5 py-0.5 text-xs font-semibold"
                                      title={t("preview.cell", { cell: issue.cell })}
                                      data-testid="import-issue-cell"
                                    >
                                      {issue.cell}
                                    </code>
                                    <span className="min-w-0 flex-1">
                                      {isKnownIssue(issue.code) ? (
                                        <>
                                          <span className={issue.severity === "error" ? "font-semibold text-error-dark" : "font-semibold"}>
                                            {t(`issues.${issue.code}.what`)}
                                          </span>{" "}
                                          <span className="text-text-muted">{t(`issues.${issue.code}.fix`)}</span>
                                        </>
                                      ) : (
                                        <span dir="auto">{issue.message}</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {shown.length > PREVIEW_PAGE ? (
                <div className="flex items-center justify-end gap-2 text-sm">
                  <Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    {t("preview.previous")}
                  </Button>
                  <span className="text-text-muted" dir="ltr">
                    {t("preview.showing", {
                      from: currentPage * PREVIEW_PAGE + 1,
                      to: Math.min(shown.length, (currentPage + 1) * PREVIEW_PAGE),
                      total: shown.length,
                    })}
                  </span>
                  <Button size="sm" variant="ghost" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)} data-testid="import-next-page">
                    {t("preview.next")}
                  </Button>
                </div>
              ) : null}

              {current.error_report_key ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`/api/catalog-imports/${current.id}/error-report`}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                    download
                    data-testid="import-report"
                  >
                    <Download className="size-4" aria-hidden />
                    {t("report.download")}
                  </a>
                  <span className="text-sm text-text-muted">{t("report.hint")}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {current?.preview && !completed && current.status === "ready" ? (
        <Card className="flex flex-col gap-3 p-4" data-testid="import-commit-card">
          <h2 className="text-lg font-semibold">{t("commit.title")}</h2>
          {canCommit(current) ? (
            <>
              {current.preview.counts.error > 0 ? <p className="text-sm">{t("commit.skipped", { count: current.preview.counts.error })}</p> : null}
              {hasStockRows(current) ? (
                <p className="text-sm">{canPostStock ? t("commit.stockNote") : t("errors.CATALOG_IMPORT_STOCK_PERMISSION_REQUIRED")}</p>
              ) : null}
              <p className="text-sm text-text-muted">{t("commit.once")}</p>
              {committing ? (
                <p className="text-sm" role="status">
                  {t("commit.applying")}
                </p>
              ) : null}
              <Button className="self-start" onClick={() => void commit()} pending={committing} disabled={busy} data-testid="import-commit">
                <CheckCircle2 className="size-4" aria-hidden />
                {t("commit.button", { count: applicableRows(current) })}
              </Button>
            </>
          ) : (
            <p className="text-sm">{t("commit.none")}</p>
          )}
        </Card>
      ) : null}

      {current && completed ? (
        <Alert tone="success" data-testid="import-result">
          <p className="text-base font-semibold">{t("result.title")}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span data-testid="import-result-created">{t("result.created", { count: result?.created ?? current.create_count })}</span>
            <span data-testid="import-result-updated">{t("result.updated", { count: result?.updated ?? current.update_count })}</span>
            <span data-testid="import-result-skipped">{t("result.skipped", { count: result?.skipped_errors ?? current.error_count })}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/catalog/products?sort=newest" className={buttonClasses({ size: "sm" })} data-testid="import-result-products">
              {t("result.products")}
            </Link>
            {(result?.opening_id ?? current.opening_id) ? (
              <Link
                href={documentHref("opening", (result?.opening_id ?? current.opening_id) as string)}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                data-testid="import-result-opening"
              >
                {t("result.opening")}
              </Link>
            ) : null}
            <Link href="/catalog/import" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("result.another")}
            </Link>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
